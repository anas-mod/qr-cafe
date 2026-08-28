
import sqlite3

DB_PATH = "cafe.db"


def get_db():
    """open a connection with rows accessible like dicts (rows['name'])."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

