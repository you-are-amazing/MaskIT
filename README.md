# MaskIT

Privacy web app: learn a face from your webcam, then blur / pixelate / sticker
faces in any uploaded photo — everyone, one specific person, males, females,
or kids only.

## Features
- **Webcam enrollment** — captures 5 frames, stores a face "embedding" (no model training needed)
- **Blur everyone** / **females only** / **males only** / **kids only** (age ≤ 17)
- **Find & hide one person** in a photo, even in group photos (face recognition)
- **Effects**: blur, pixelate, black box, emoji, hearts
- Per-face report: estimated age, gender, match info

## Tech
- **Backend**: FastAPI + InsightFace (RetinaFace detection, ArcFace recognition, age/gender)
- **DB**: SQLite (face embeddings stored locally)
- **Frontend**: vanilla HTML/JS, webcam via `getUserMedia`

## Setup
1. Python 3.10+ recommended
   ```
   pip install -r requirements.txt
   ```
   (First run auto-downloads the ~300 MB `buffalo_l` model pack.)
2. Run the server from the project root:
   ```
   uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
3. Open **http://localhost:8000** in your browser
   (the webcam requires `localhost` or HTTPS).

   Running over plain HTTP on a LAN IP? Set `MASKIT_SECURE_COOKIES=0`,
   otherwise the browser drops the session cookie and each request looks
   like a brand-new visitor (so face memories vanish between clicks).

## Privacy model
- Photos are processed in memory on the server running the app and are never
  written to disk. Processed results are deleted after 1 hour.
- Enrolled faces are **per-visitor**, stored under a signed session cookie
  (`HttpOnly`, `SameSite=Lax`), so people sharing the URL don't share a face
  database. Deleting your browser cookie removes your access to them.
- There is **no account or password**. Anyone who can reach the URL can enroll
  faces and process photos. Don't put it on a public IP you care about without
  adding auth in front.
- Face embeddings are biometric data — get consent, and check your local law.

## How to use
1. Enter a name → **Start camera** → **Capture & learn** (5 frames).
2. Upload a photo, pick an **Effect** and **Who**, click **Process**.
3. Download the result.

## Notes / tuning
- `MATCH_THRESHOLD` in `backend/config.py` — raise it if wrong people get blurred,
  lower it if the enrolled person is missed.
- `DET_SIZE` — try `(1280, 1280)` for very large group photos with small faces.
- For GPU, install a CUDA build of PyTorch/ONNXRuntime first for big speedups.
- Emoji mode needs a color-emoji font (NotoColorEmoji / Segoe UI Emoji /
  Apple Color Emoji); otherwise it gracefully draws hearts.

## License
Source code: **MIT** — see [LICENSE](LICENSE).

⚠️ **The model is not MIT.** MaskIT auto-downloads the InsightFace `buffalo_l`
model pack, which upstream releases for **non-commercial research purposes
only**. Commercial use of that model requires a separate license from
InsightFace. Swap in your own model in `backend/face_engine.py` to avoid this.

## Legal / ethics
Blur your own face or get consent from people whose faces you process.
Face data is biometric data under laws like GDPR.

## Project layout
```
maskit/
├── backend/
│   ├── main.py        # FastAPI routes
│   ├── face_engine.py # InsightFace wrapper (detect / embed / match)
│   ├── effects.py     # blur, pixelate, emoji, hearts
│   ├── database.py    # SQLite embeddings
│   ├── config.py      # thresholds & paths
│   └── static/        # frontend
├── data/              # face DB + processed photos (git-ignored)
├── requirements.txt
└── README.md
```
