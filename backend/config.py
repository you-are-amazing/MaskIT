import os
import secrets

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "faces.db")
OUTPUT_DIR = os.path.join(DATA_DIR, "outputs")
SECRET_PATH = os.path.join(DATA_DIR, "session_secret")

MATCH_THRESHOLD = 0.45   # cosine similarity; ArcFace same-person is typically >0.4. Raise if wrong people get hidden.
KID_MAX_AGE = 17
DET_SIZE = (640, 640)    # try (1280, 1280) for big group photos
MIN_DET_SCORE = 0.6      # ignore weak detections during enrollment
MAX_UPLOAD_MB = 15
MAX_SIDE = 2560          # larger photos are downscaled (bounds memory + time)
OUTPUT_TTL_SECONDS = 3600  # processed images are deleted after this
SESSION_COOKIE = "maskit_sid"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30  # a visitor's enrolled faces stay for 30 days
# Only mark the cookie Secure when the site is actually served over HTTPS, else
# the browser drops it on plain-HTTP/IP access (which is how it runs locally).
SESSION_COOKIE_SECURE = os.environ.get("MASKIT_SECURE_COOKIES", "1") == "1"


def load_secret() -> bytes:
    """Signing key for session cookies. Kept on disk so logins survive a restart.

    Set MASKIT_SECRET to override (e.g. from an env var in production).
    """
    env = os.environ.get("MASKIT_SECRET")
    if env:
        return env.encode()
    try:
        with open(SECRET_PATH, "rb") as f:
            data = f.read().strip()
            if data:
                return data
    except FileNotFoundError:
        pass
    data = secrets.token_hex(32).encode()
    try:
        with open(SECRET_PATH, "wb") as f:
            f.write(data)
        os.chmod(SECRET_PATH, 0o600)  # signing key readable only by the app user
    except OSError:
        pass  # read-only FS: sessions just reset on restart
    return data


SECRET = load_secret()

for _d in (DATA_DIR, OUTPUT_DIR):
    os.makedirs(_d, exist_ok=True)
