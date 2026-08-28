"""
Cafe QR ordering backend — starter skeleton.


Run:
    python app.py
Then visit:
    http://localhost:5000/api/menu/demo-cafe
"""

from flask import Flask, request, jsonify
from database import get_db
import qrcode
import os

app = Flask(__name__)

@app.route("/", methods=["GET"])
def index():
    return jsonify({"status": "Cafe QR backend is running"})

# Change this to your real deployed URL once you go live (Render/Railway, etc.)
BASE_URL = "http://localhost:5000"


# ---------------------------------------------------------------------
# MENU
# ---------------------------------------------------------------------

@app.route("/api/menu/<slug>", methods=["GET"])
def get_menu(slug):
    """Return all available menu items for a given restaurant slug."""
    db = get_db()
    restaurant = db.execute(
        "SELECT * FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()

    if restaurant is None:
        return jsonify({"error": "restaurant not found"}), 404

    items = db.execute(
        "SELECT id, name, price, category FROM menu_items "
        "WHERE restaurant_id = ? AND is_available = 1",
        (restaurant["id"],),
    ).fetchall()

    db.close()

    return jsonify({
        "restaurant": restaurant["name"],
        "menu": [dict(item) for item in items],
    })


# ---------------------------------------------------------------------
# ORDERS
# ---------------------------------------------------------------------

@app.route("/api/order", methods=["POST"])
def place_order():
    """
    Expects JSON like:
    {
        "slug": "demo-cafe",
        "table_number": "5",
        "items": [
            {"menu_item_id": 1, "quantity": 2},
            {"menu_item_id": 3, "quantity": 1}
        ]
    }
    """
    data = request.get_json()

    if not data or "items" not in data or not data["items"]:
        return jsonify({"error": "order must include at least one item"}), 400

    db = get_db()
    restaurant = db.execute(
        "SELECT * FROM restaurants WHERE slug = ?", (data.get("slug"),)
    ).fetchone()

    if restaurant is None:
        return jsonify({"error": "restaurant not found"}), 404

    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO orders (restaurant_id, table_number, status) VALUES (?, ?, 'pending')",
        (restaurant["id"], data.get("table_number")),
    )
    order_id = cursor.lastrowid

    for item in data["items"]:
        menu_item = db.execute(
            "SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?",
            (item["menu_item_id"], restaurant["id"]),
        ).fetchone()

        if menu_item is None:
            db.rollback()
            return jsonify({"error": f"menu item {item['menu_item_id']} not found"}), 400

        cursor.execute(
            "INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order) "
            "VALUES (?, ?, ?, ?)",
            (order_id, menu_item["id"], item["quantity"], menu_item["price"]),
        )

    db.commit()
    db.close()

    return jsonify({"order_id": order_id, "status": "pending"}), 201


@app.route("/api/order/<int:order_id>", methods=["GET"])
def get_order(order_id):
    """Return order status and a computed bill — this is what the customer's
    'View Bill' button will call."""
    db = get_db()

    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if order is None:
        return jsonify({"error": "order not found"}), 404

    line_items = db.execute(
        """
        SELECT oi.quantity, oi.price_at_order, mi.name
        FROM order_items oi
        JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = ?
        """,
        (order_id,),
    ).fetchall()

    db.close()

    bill_lines = [
        {
            "name": row["name"],
            "quantity": row["quantity"],
            "price_each": row["price_at_order"],
            "subtotal": row["quantity"] * row["price_at_order"],
        }
        for row in line_items
    ]
    total = sum(line["subtotal"] for line in bill_lines)

    return jsonify({
        "order_id": order_id,
        "status": order["status"],
        "table_number": order["table_number"],
        "items": bill_lines,
        "total": round(total, 2),
    })


@app.route("/api/order/<int:order_id>/status", methods=["POST"])
def update_order_status(order_id):
    """Staff dashboard calls this to move an order through
    pending -> preparing -> served -> billed."""
    data = request.get_json()
    new_status = data.get("status") if data else None

    valid_statuses = {"pending", "preparing", "served", "billed"}
    if new_status not in valid_statuses:
        return jsonify({"error": f"status must be one of {valid_statuses}"}), 400

    db = get_db()
    db.execute("UPDATE orders SET status = ? WHERE id = ?", (new_status, order_id))
    db.commit()
    db.close()

    return jsonify({"order_id": order_id, "status": new_status})


@app.route("/api/orders/<slug>", methods=["GET"])
def list_active_orders(slug):
    """Staff dashboard polls this to see live incoming orders for their cafe."""
    db = get_db()
    restaurant = db.execute(
        "SELECT * FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()

    if restaurant is None:
        return jsonify({"error": "restaurant not found"}), 404

    orders = db.execute(
        "SELECT * FROM orders WHERE restaurant_id = ? AND status != 'billed' "
        "ORDER BY created_at DESC",
        (restaurant["id"],),
    ).fetchall()
    db.close()

    return jsonify([dict(o) for o in orders])


# ---------------------------------------------------------------------
# QR CODE GENERATION
# ---------------------------------------------------------------------

@app.route("/api/generate-qr/<slug>", methods=["GET"])
def generate_qr(slug):
    """Generates a QR code image pointing to this cafe's menu page and
    saves it locally. In production your friends' menu page URL goes here
    instead of the raw API URL."""
    os.makedirs("qr_codes", exist_ok=True)

    menu_url = f"{BASE_URL}/menu/{slug}"  # frontend route, once it exists
    img = qrcode.make(menu_url)
    path = f"qr_codes/{slug}.png"
    img.save(path)

    return jsonify({"slug": slug, "url": menu_url, "saved_to": path})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
