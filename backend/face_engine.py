import numpy as np
from insightface.app import FaceAnalysis
from backend.config import DET_SIZE, MATCH_THRESHOLD

_engine = None


def get_engine():
    """Lazy singleton so the server starts fast and models load on first use."""
    global _engine
    if _engine is None:
        _engine = FaceEngine()
    return _engine


class FaceEngine:
    def __init__(self):
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
        )
        self.app.prepare(ctx_id=0, det_size=DET_SIZE)

    def detect(self, img_bgr: np.ndarray):
        """Return list of insightface Face objects (bbox, kps, gender, age, embedding)."""
        return self.app.get(img_bgr)

    @staticmethod
    def cosine(a: np.ndarray, b: np.ndarray) -> float:
        denom = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / denom) if denom else -1.0

    def match_person(self, embedding: np.ndarray, persons: dict, threshold: float = MATCH_THRESHOLD):
        """Best-matching enrolled person, or (None, best_score) if below threshold."""
        best_name, best_sim = None, -1.0
        for name, ref in persons.items():
            sim = self.cosine(embedding, ref)
            if sim > best_sim:
                best_name, best_sim = name, sim
        if best_name is not None and best_sim >= threshold:
            return best_name, best_sim
        return None, best_sim
