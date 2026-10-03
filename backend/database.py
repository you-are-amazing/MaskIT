import sqlite3
import time
from contextlib import closing

import numpy as np

from backend.config import DB_PATH


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("CREATE TABLE IF NOT EXISTS persons(session_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, embedding BLOB NOT NULL, created_at REAL NOT NULL, PRIMARY KEY (session_id, name))")
    cols = {r[1] for r in conn.execute("PRAGMA table_info(persons)")}
    if "session_id" not in cols:  # migrate a pre-session DB
        conn.execute("ALTER TABLE persons RENAME TO persons_old")
        conn.execute("CREATE TABLE persons(session_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, embedding BLOB NOT NULL, created_at REAL NOT NULL, PRIMARY KEY (session_id, name))")
        conn.execute("INSERT INTO persons SELECT '', name, embedding, created_at FROM persons_old")
        conn.execute("DROP TABLE persons_old")
        conn.commit()
    return conn


def save_person(session_id: str, name: str, embedding: np.ndarray):
    with closing(_conn()) as c, c:
        c.execute("INSERT OR REPLACE INTO persons VALUES (?,?,?,?)", (session_id, name, embedding.astype(np.float32).tobytes(), time.time()))


def load_persons(session_id: str) -> dict:
    with closing(_conn()) as c:
        rows = c.execute("SELECT name, embedding FROM persons WHERE session_id=? ORDER BY name", (session_id,)).fetchall()
    return {n: np.frombuffer(b, dtype=np.float32) for n, b in rows}


def delete_person(session_id: str, name: str):
    with closing(_conn()) as c, c:
        c.execute("DELETE FROM persons WHERE session_id=? AND name=?", (session_id, name))


def delete_all(session_id: str):
    with closing(_conn()) as c, c:
        c.execute("DELETE FROM persons WHERE session_id=?", (session_id,))