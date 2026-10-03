<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="backend/static/logo-inverted.png">
    <img src="backend/static/logo.png" alt="MaskIT" width="420">
  </picture>
</p>

<p align="center"><strong>A local-first face anonymizer.</strong><br>
Teach it your face once via webcam, then hide yourself — and only yourself —
in any photo. Also hides everyone, everyone except you, or people filtered by
estimated age and gender.<br><br>
Runs entirely on your own machine. No uploads, no cloud, no account.</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.10%2B-blue" alt="Python 3.10+">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/frontend-vanilla%20JS-orange" alt="Vanilla JS">
</p>

## Why this is more than a blur filter

Most face blur tools detect *a* face and hide it. MaskIT identifies *whose* face
it found, using ArcFace embeddings, so it can answer questions like "hide my
face but keep everyone else" — in group photos, where that actually matters.

| Capability | How |
|---|---|
| Find every face | RetinaFace detection |
| Recognise **who** it is | ArcFace 512-d embeddings, cosine match |
| Estimate age / gender | InsightFace `genderage` head |

## Features

- **Webcam enrollment** — 5 frames → one averaged, normalised embedding. No model training.
- **Six scopes** — everyone · only selected people · everyone *except* selected · kids (≤17) · women · men.
- **Six effects** — Gaussian blur · pixelate · dark box · cyber glitch · cool emoji · hearts.
- **Manual override** — click any detected face box to keep or hide it, ignoring the automatic rule.
- **Live tuning** — intensity, boundary margin, feathered edges and detection confidence re-render instantly.
- **Split compare** — wipe between original and masked.
- **Batch queue** — drop multiple photos, export as `.zip`.
- **EXIF stripped** on every processed image, including GPS.

## Tech

| Layer | Choice |
|---|---|
| Backend | FastAPI, InsightFace (`buffalo_l`), ONNX Runtime |
| Database | SQLite — face embeddings only, stored locally |
| Frontend | Vanilla HTML/CSS/JS, webcam via `getUserMedia` |
| Dependencies | 7 packages |

## Performance

Measured on 8 vCPU (x86, no GPU) with a 1200×900 photo:

| | Time |
|---|---|
| Model load (once) | 5.0 s |
| First inference | 573–908 ms |
| Warm inference | **73–166 ms** |
| Peak RAM | **854 MB** |

CPU-only, no GPU required. Roughly 6–13 photos/second warm.

## Setup

```bash
pip install -r requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Then open **http://localhost:8000**.

The first enrollment or photo auto-downloads the 282 MB `buffalo_l` model pack,
so the very first request takes a few seconds.

> **Use `localhost`, not your LAN IP.** The webcam uses `getUserMedia`, which
> browsers only permit on `localhost` or HTTPS. On a plain-HTTP LAN address the
> camera silently fails.
>
> If you *do* run on a LAN IP, set `MASKIT_SECURE_COOKIES=0`, or the browser
> drops the session cookie and every request looks like a new visitor.

### Docker

```bash
docker build -t maskit .
docker run -d -p 8000:8000 maskit
```

The model is baked into the image at build time (~3 GB image), so the first
visitor doesn't wait on a download.

## Using it

1. Enter a name → **Live webcam** → **Capture 5 frames**.
2. Drop in a photo, choose a **Scope** and **Effect**, click **Anonymize**.
3. Click any face box to override the rule, then **Apply to selected**.
4. **Download** or **Copy to clipboard**.

## Privacy design

Face data is biometric data, so the access model matters as much as the model.

- **Photos are never written to disk.** Decoded in memory, rendered, returned. Processed results are deleted after 1 hour.
- **Enrolled faces are per-visitor**, keyed by a signed session cookie (`HttpOnly`, `SameSite=Lax`). Two people on the same URL do not share a face database — deleting your cookie revokes your access.
- **Result images are session-bound**, so one visitor cannot fetch another's processed photos by guessing a filename.
- **Signing keys are never in the repo.** `data/` is git-ignored; `data/session_secret` is generated on first run at `0600`.
- **No account system.** Isolation stops people reading *each other's* faces, but anyone who can reach the URL can still enroll faces and process photos. Add auth before exposing it publicly.
- Face embeddings are biometric data under GDPR and similar laws — process only photos of yourself or people who consented.

## Design notes

Some decisions worth recording:

- **Per-face identity is enforced server-side.** The client sends a name list, but the query is scoped to the session, so a hand-crafted request can't read another person's embeddings.
- **`Secure` is derived from the request scheme**, not hardcoded. Defaulting it on meant a first visit over plain HTTP silently lost its cookie and faces appeared not to save.
- **Enrollment rejects mixed frames.** Averaged embeddings are recomputed against outliers and discarded if the frames showed different people — a stranger walking past shouldn't poison your face.
- **Manual selection beats the rules.** Clicking a box sets an explicit index list that overrides gender/age/person matching.
- **Detection cache** (`_CACHE`, last 4 photos) makes slider tweaks re-render without re-running inference.

Tunable in `backend/config.py`:
- `MATCH_THRESHOLD` (0.45) — raise if the wrong person gets hidden, lower if yours is missed.
- `DET_SIZE` — try `(1280, 1280)` for very large group photos.
- `MIN_DET_SCORE` — how confident enrollment must be.

For GPU, install a CUDA build of ONNX Runtime.

> **Emoji mode** needs a colour-emoji font (Noto Color Emoji / Segoe UI Emoji /
> Apple Color Emoji); without one it falls back to hearts.

## Project layout

```
maskit/
├── backend/
│   ├── main.py         # FastAPI routes, session handling
│   ├── face_engine.py  # InsightFace wrapper: detect / embed / match
│   ├── effects.py      # 6 masking effects
│   ├── database.py     # SQLite, scoped per session
│   ├── config.py       # thresholds, paths, cookie + secret config
│   └── static/         # frontend (index.html, app.js, style.css, logo.png)
├── data/               # face DB + outputs — git-ignored, never committed
├── Dockerfile
└── requirements.txt
```

## License

Source code: **MIT** — see [LICENSE](LICENSE).

⚠️ **The model is not MIT.** MaskIT uses the InsightFace `buffalo_l` model pack,
which upstream releases for **non-commercial research purposes only**. Commercial
use needs a separate license from InsightFace. Swap in your own model via
`FaceAnalysis(...)` in `backend/face_engine.py` to avoid this.

Other dependencies keep their own licenses (FastAPI, OpenCV, Pillow, NumPy,
ONNX Runtime, InsightFace).

## Legal

Blur your own face, or get consent from people whose faces you process. Face data
is biometric data under laws like GDPR — this is a tool, and using it on someone
without their agreement may be unlawful where they live.