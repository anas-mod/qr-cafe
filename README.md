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
app.py            All routes (pages + API)
database.py       SQLite connection helper
schema.sql        Tables + sample seed data
templates/        menu.html, admin.html
static/           CSS + JS for each page
```

## Setup

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

python3 -c "
import sqlite3
conn = sqlite3.connect('cafe.db')
conn.executescript(open('schema.sql').read())
conn.commit()
"

python3 app.py
```

Open:
- Customer menu: `http://127.0.0.1:5000/menu/sunrise-cafe`
- Staff board: `http://127.0.0.1:5000/admin/sunrise-cafe`

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/menu/<slug>` | Get menu items |
| POST | `/api/order` | Place an order |
| GET | `/api/order/<id>` | Get status + bill |
| POST | `/api/order/<id>/status` | Update order status |
| GET | `/api/orders/<slug>` | All active orders (for admin board) |
| GET | `/api/generate-qr/<slug>` | Generate QR code PNG |

## Not built yet

Payments, admin UI for menu editing, auth on the admin board, production
deployment. Currently for local dev only.
