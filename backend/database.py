import sqlite3
import time
from contextlib import closing

import numpy as np

from backend.config import DB_PATH


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS persons(name TEXT PRIMARY KEY, embedding BLOB NOT NULL, created_at REAL NOT NULL)")
    return conn


def save_person(name: str, embedding: np.ndarray):
    with closing(_conn()) as c, c:
        c.execute("INSERT OR REPLACE INTO persons VALUES (?,?,?)", (name, embedding.astype(np.float32).tobytes(), time.time()))


def load_persons() -> dict:
    with closing(_conn()) as c:
        rows = c.execute("SELECT name, embedding FROM persons ORDER BY name").fetchall()
    return {n: np.frombuffer(b, dtype=np.float32) for n, b in rows}


def delete_person(name: str):
    with closing(_conn()) as c, c:
        c.execute("DELETE FROM persons WHERE name=?", (name,))


def delete_all():
    with closing(_conn()) as c, c:
        c.execute("DELETE FROM persons")
