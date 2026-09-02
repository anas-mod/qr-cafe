"""
manage_admin.py — command-line tool for managing per-restaurant admin
accounts. Each restaurant has its own login, so one cafe's staff can
never access another cafe's dashboard.

Usage:
    python3 manage_admin.py set-password <slug> <new_password>
    python3 manage_admin.py add-restaurant <name> <slug> <password>

Examples:
    python3 manage_admin.py set-password sunrise-cafe "correct horse battery"
    python3 manage_admin.py add-restaurant "Demo Cafe" demo-cafe "another-password"
"""

import sys
from werkzeug.security import generate_password_hash
from database import get_db


def set_password(slug, password):
    db = get_db()
    restaurant = db.execute(
        "SELECT id FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()

    if restaurant is None:
        print(f"No restaurant found with slug '{slug}'.")
        db.close()
        return

    db.execute(
        "UPDATE restaurants SET password_hash = ? WHERE slug = ?",
        (generate_password_hash(password), slug),
    )
    db.commit()
    db.close()
    print(f"Password set for '{slug}'.")


def add_restaurant(name, slug, password):
    db = get_db()
    existing = db.execute(
        "SELECT id FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()

    if existing:
        print(f"A restaurant with slug '{slug}' already exists.")
        db.close()
        return

    db.execute(
        "INSERT INTO restaurants (name, slug, password_hash) VALUES (?, ?, ?)",
        (name, slug, generate_password_hash(password)),
    )
    db.commit()
    db.close()
    print(f"Restaurant '{name}' added with slug '{slug}'.")
    print(f"Admin dashboard: /admin/{slug}   Menu page: /menu/{slug}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]

    if command == "set-password" and len(sys.argv) == 4:
        set_password(sys.argv[2], sys.argv[3])
    elif command == "add-restaurant" and len(sys.argv) == 5:
        add_restaurant(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(__doc__)
        sys.exit(1)
