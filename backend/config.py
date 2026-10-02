import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "faces.db")
OUTPUT_DIR = os.path.join(DATA_DIR, "outputs")

MATCH_THRESHOLD = 0.45   # cosine similarity; ArcFace same-person is typically >0.4. Raise if wrong people get hidden.
KID_MAX_AGE = 17
DET_SIZE = (640, 640)    # try (1280, 1280) for big group photos
MIN_DET_SCORE = 0.6      # ignore weak detections during enrollment
MAX_UPLOAD_MB = 15
MAX_SIDE = 2560          # larger photos are downscaled (bounds memory + time)
OUTPUT_TTL_SECONDS = 3600  # processed images are deleted after this

for _d in (DATA_DIR, OUTPUT_DIR):
    os.makedirs(_d, exist_ok=True)
