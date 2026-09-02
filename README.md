# Cafe QR — Menu, Ordering & Billing

QR-code ordering system for cafes: customers scan a code, view the menu,
order, and check their bill from a browser. Staff manage live orders from
an admin board. Plain Flask + vanilla HTML/CSS/JS — no frameworks, no
build step.

## How it works

Customer scans QR → `/menu/<slug>` → places order → saved to SQLite →
appears live on `/admin/<slug>` for staff to update (pending → preparing →
served → billed).

## Structure

```
client/
  templates/       menu.html, admin.html
  static/          CSS + JS for each page
server/
  app.py           All routes (pages + API)
  database.py      SQLite connection helper
  schema.sql       Tables + sample seed data
  requirements.txt
```

## Setup

```bash
cd server
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

python3 -c "
import sqlite3
conn = sqlite3.connect('cafe.db')
conn.executescript(open('schema.sql').read())
conn.commit()
"

# Set a password for the seeded restaurant (required — it has none by default)
python3 manage_admin.py set-password sunrise-cafe "pick-a-real-password"

python3 app.py
```

Open:
- Customer menu: `http://127.0.0.1:5000/menu/sunrise-cafe`
- Staff login: `http://127.0.0.1:5000/admin/sunrise-cafe/login`
- **Interactive API docs:** `http://127.0.0.1:5000/apidocs/` — browse every
  endpoint and click "Try it out" to call it directly from the browser.
  Start here if you're new to the project.

## Admin access

Each restaurant has its OWN login — logging into `sunrise-cafe` does not
grant access to any other cafe's dashboard or data.

```bash
# Set/reset a restaurant's password
python3 manage_admin.py set-password <slug> <password>

# Onboard a brand new restaurant (creates it + sets its password)
python3 manage_admin.py add-restaurant "Cafe Name" <slug> <password>
```

From the admin board, staff can also manage the menu directly (add, edit,
delete items) under the "Manage Menu" tab — no code changes needed.

## API

Full interactive docs live at `/apidocs/` once the server is running —
that's the easiest way to explore this. Summary:

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/menu/<slug>` | none | Get available menu items (customer-facing) |
| POST | `/api/order` | none | Place an order |
| GET | `/api/order/<id>` | none | Get status + bill |
| POST | `/api/order/<id>/status` | staff | Update order status |
| GET | `/api/orders/<slug>` | staff | All active orders (for admin board) |
| GET | `/api/admin/menu/<slug>` | staff | All menu items, incl. unavailable |
| POST | `/api/admin/menu/<slug>` | staff | Add a menu item |
| PUT | `/api/admin/menu/<slug>/<id>` | staff | Edit a menu item |
| DELETE | `/api/admin/menu/<slug>/<id>` | staff | Delete a menu item (blocked if it's part of past orders) |
| GET | `/api/generate-qr/<slug>` | none | Generate QR code PNG |

## Not built yet

Payments, production deployment. Currently for local dev only.
