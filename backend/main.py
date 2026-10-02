import hashlib
import io
import json
import os
import re
import time
import uuid
from collections import OrderedDict

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

from backend import effects
from backend.config import *  # noqa: F401,F403
from backend.database import delete_all, delete_person, load_persons, save_person
from backend.face_engine import get_engine

app = FastAPI(title="MaskIT")
TARGETS = {"all", "male", "female", "kids", "person", "except_person"}
NAME_RE = re.compile(r"^[\w .'-]{1,40}$")


_CACHE = OrderedDict()  # face detections for the last few photos, so slider tweaks re-render instantly


def detect_cached(engine, key, bgr):
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]
    faces = _CACHE[key] = engine.detect(bgr)
    while len(_CACHE) > 4:
        _CACHE.popitem(last=False)
    return faces


def err(msg, code=400):
    return JSONResponse({"error": msg}, status_code=code)


def load_image(data: bytes):
    """Decode once with PIL (honours EXIF rotation) so boxes always line up with the output."""
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise ValueError(f"Image is larger than {MAX_UPLOAD_MB} MB")
    try:
        pil = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception:
        raise ValueError("That file isn't a readable image")
    pil.thumbnail((MAX_SIDE, MAX_SIDE))
    return pil, cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)


def cleanup_outputs():
    now = time.time()
    for f in os.listdir(OUTPUT_DIR):
        p = os.path.join(OUTPUT_DIR, f)
        if now - os.path.getmtime(p) > OUTPUT_TTL_SECONDS:
            os.remove(p)


# Plain `def` routes run in a threadpool, so slow model inference doesn't freeze the server.
@app.post("/api/enroll")
def enroll(name: str = Form(...), files: list[UploadFile] = File(...)):
    name = name.strip()
    if not NAME_RE.match(name):
        return err("Use a name of 1–40 letters, numbers, spaces or . ' -")
    engine, embs = get_engine(), []
    for f in files:
        try:
            _, bgr = load_image(f.file.read())
        except ValueError:
            continue
        faces = [x for x in engine.detect(bgr) if x.det_score >= MIN_DET_SCORE]
        if faces:
            embs.append(max(faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1])).normed_embedding)
    need = min(3, len(files))
    if len(embs) < need:
        return err(f"Only {len(embs)} usable frame(s). Face the camera in good light and try again.")
    mean = np.mean(embs, axis=0)
    keep = [e for e in embs if engine.cosine(e, mean) >= 0.5]  # drop frames where someone else walked in
    if len(keep) < need:
        return err("The frames showed different people. Make sure only you are in view.")
    mean = np.mean(keep, axis=0)
    save_person(name, mean / np.linalg.norm(mean))
    return {"status": "ok", "person": name, "frames_used": len(keep)}


@app.get("/api/persons")
def persons():
    return {"persons": list(load_persons().keys())}


@app.delete("/api/persons")
def remove_all():
    delete_all()
    return {"status": "ok"}


@app.delete("/api/persons/{name}")
def remove_person(name: str):
    delete_person(name)
    return {"status": "ok", "removed": name}


@app.post("/api/process")
def process(
    file: UploadFile = File(...),
    effect: str = Form("blur"),
    target: str = Form("all"),
    persons: list[str] = Form([]),
    override: str = Form(""),  # JSON list of face indices: manual selection beats the rules
    intensity: int = Form(85),
    margin: int = Form(18),
    feather: bool = Form(True),
    min_conf: int = Form(50),
):
    if effect not in effects.APPLY:
        return err(f"effect must be one of {sorted(effects.APPLY)}")
    if target not in TARGETS:
        return err(f"target must be one of {sorted(TARGETS)}")
    try:
        raw = file.file.read()
        pil, bgr = load_image(raw)
        manual = set(json.loads(override)) if override else None
    except (ValueError, TypeError) as e:
        return err(str(e))

    db = load_persons() if target in ("person", "except_person") else {}
    if db and not db.keys() & set(persons or db):
        return err("Pick at least one enrolled person")
    if target in ("person", "except_person") and not db:
        return err("Enroll a person first")
    chosen = set(persons) & db.keys() or set(db)

    engine = get_engine()
    t0 = time.time()
    faces = sorted([f for f in detect_cached(engine, hashlib.sha1(raw).hexdigest(), bgr) if f.det_score * 100 >= min_conf], key=lambda f: f.bbox[0])  # stable order so manual indices stay valid
    report, hidden = [], 0
    for i, fc in enumerate(faces):
        gender = "male" if int(fc.gender) == 1 else "female"
        age = int(round(float(fc.age)))
        match, sim = (engine.match_person(fc.normed_embedding, db) if db else (None, 0.0))
        rules = {
            "all": (True, "Every face"),
            "male": (gender == "male", f"Looks {gender}"),
            "female": (gender == "female", f"Looks {gender}"),
            "kids": (age <= KID_MAX_AGE, f"About {age} years old"),
            "person": (match in chosen, f"Matches {match} ({sim:.2f})" if match else f"No match ({sim:.2f})"),
            "except_person": (match not in chosen, f"Matches {match} ({sim:.2f})" if match else f"No match ({sim:.2f})"),
        }
        hit, info = rules[target]
        if manual is not None:
            hit = i in manual
        if hit:
            effects.APPLY[effect](pil, effects.crop_box(pil.size, fc.bbox, margin / 100), intensity / 100, feather)
            hidden += 1
        report.append({"box": [int(v) for v in fc.bbox], "hidden": hit, "info": info, "gender": gender, "age": age, "conf": round(float(fc.det_score) * 100, 1)})

    cleanup_outputs()
    fname = f"{uuid.uuid4().hex}.jpg"
    pil.save(os.path.join(OUTPUT_DIR, fname), format="JPEG", quality=92)
    return {"image": f"/api/result/{fname}", "width": pil.width, "height": pil.height,
            "ms": int((time.time() - t0) * 1000), "faces_found": len(faces), "faces_hidden": hidden, "faces": report}


@app.get("/api/result/{fname}")
def result(fname: str):
    path = os.path.join(OUTPUT_DIR, fname)
    if not re.fullmatch(r"[0-9a-f]{32}\.jpg", fname) or not os.path.isfile(path):
        return err("Result expired or not found. Process the photo again.", 404)
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "backend", "static"), html=True), name="static")