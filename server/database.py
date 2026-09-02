import sqlite3

DB_PATH = "cafe.db"


def get_db():
    """Open a connection with rows accessible like dicts (row['name'])."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
