"""
Cafe QR ordering backend — starter skeleton.

Your friends' frontend will call these JSON endpoints. Run this file,
then hit the routes below with curl or a browser to see it work
before any frontend exists.

Run:
    python app.py
Then visit:
    http://localhost:5000/api/menu/sunrise-cafe
"""

from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from flasgger import Swagger
from database import get_db
import qrcode
import os

app = Flask(
    __name__,
    template_folder="../client/templates",
    static_folder="../client/static",
)

# Auto-generates an interactive API documentation page at /apidocs, built
# from the YAML docstrings on each route below. Anyone on the team can
# open it in a browser, see every endpoint, and click "Try it out" to
# actually call it — no curl or Postman knowledge needed.
app.config["SWAGGER"] = {
    "title": "Cafe QR API",
    "description": "Menu, ordering, billing, and admin endpoints for the Cafe QR system.",
    "uiversion": 3,
}
swagger = Swagger(app)

# Needed for Flask's session cookies (login state) to be secure/signed.
# Set a real secret via environment variable in production — this fallback
# is only for local dev.
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-this")

# Change this to your real deployed URL once you go live (Render/Railway, etc.)
BASE_URL = "http://localhost:5000"


def login_required(view_func):
    """Decorator: checks that the logged-in session belongs to THIS
    specific restaurant, not just 'any admin, anywhere'.

    Works out which restaurant a request is about two ways:
    - if the route has a <slug> in its URL, look up that restaurant
    - if the route only has an <order_id> (order status updates), look up
      which restaurant that order belongs to
    Then compares it against the restaurant_id stored in the session.
    """
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        db = get_db()
        restaurant_id = None

        if "slug" in kwargs:
            row = db.execute(
                "SELECT id FROM restaurants WHERE slug = ?", (kwargs["slug"],)
            ).fetchone()
            restaurant_id = row["id"] if row else None
        elif "order_id" in kwargs:
            row = db.execute(
                "SELECT restaurant_id FROM orders WHERE id = ?", (kwargs["order_id"],)
            ).fetchone()
            restaurant_id = row["restaurant_id"] if row else None

        db.close()

        if restaurant_id is None or session.get("admin_restaurant_id") != restaurant_id:
            if request.path.startswith("/api/"):
                return jsonify({"error": "authentication required"}), 401
            return redirect(url_for("admin_login", slug=kwargs.get("slug", ""), next=request.path))

        return view_func(*args, **kwargs)
    return wrapped


@app.route("/", methods=["GET"])
def index():
    return jsonify({"status": "Cafe QR backend is running"})


@app.route("/menu/<slug>", methods=["GET"])
def menu_page(slug):
    """Serves the actual customer-facing menu page. This is the URL
    the QR code should point to."""
    return render_template("menu.html", slug=slug)


@app.route("/admin/<slug>/login", methods=["GET", "POST"])
def admin_login(slug):
    """Staff login page, scoped to ONE restaurant. On success, stores that
    restaurant's id in the session — logging in only grants access to
    that restaurant's dashboard and data, not any other cafe's."""
    db = get_db()
    restaurant = db.execute(
        "SELECT * FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()
    db.close()

    if restaurant is None:
        return jsonify({"error": "restaurant not found"}), 404

    error = None

    if request.method == "POST":
        password = request.form.get("password", "")
        if restaurant["password_hash"] and check_password_hash(restaurant["password_hash"], password):
            session["admin_restaurant_id"] = restaurant["id"]
            next_path = request.args.get("next") or request.form.get("next")
            return redirect(next_path or url_for("admin_page", slug=slug))
        error = "Incorrect password."

    return render_template(
        "admin_login.html", error=error, slug=slug, restaurant_name=restaurant["name"]
    )


@app.route("/admin/<slug>/logout", methods=["POST"])
def admin_logout(slug):
    session.pop("admin_restaurant_id", None)
    return redirect(url_for("admin_login", slug=slug))


@app.route("/admin/<slug>", methods=["GET"])
@login_required
def admin_page(slug):
    """Staff-facing dashboard showing live incoming orders for one cafe.
    Protected — requires login scoped to this specific restaurant."""
    return render_template("admin.html", slug=slug)


# ---------------------------------------------------------------------
# MENU
# ---------------------------------------------------------------------

@app.route("/api/menu/<slug>", methods=["GET"])
def get_menu(slug):
    """Get available menu items for a restaurant.
    ---
    tags:
      - Menu (public)
    parameters:
      - name: slug
        in: path
        type: string
        required: true
        example: sunrise-cafe
    responses:
      200:
        description: Menu items for this restaurant
      404:
        description: Restaurant not found
    """
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
# MENU MANAGEMENT (admin only — add/edit/delete items, see everything
# including items currently marked unavailable)
# ---------------------------------------------------------------------

@app.route("/api/admin/menu/<slug>", methods=["GET"])
@login_required
def admin_get_menu(slug):
    """Get ALL menu items for a restaurant, including unavailable ones. Staff only.
    ---
    tags:
      - Menu management (staff only)
    parameters:
      - name: slug
        in: path
        type: string
        required: true
    responses:
      200:
        description: All menu items
      401:
        description: Not logged in as this restaurant's admin
    """
    db = get_db()
    restaurant = db.execute(
        "SELECT * FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()

    if restaurant is None:
        db.close()
        return jsonify({"error": "restaurant not found"}), 404

    items = db.execute(
        "SELECT id, name, price, category, is_available FROM menu_items "
        "WHERE restaurant_id = ? ORDER BY category, name",
        (restaurant["id"],),
    ).fetchall()
    db.close()

    return jsonify([dict(item) for item in items])


@app.route("/api/admin/menu/<slug>", methods=["POST"])
@login_required
def admin_add_menu_item(slug):
    """Add a new menu item. Staff only.
    ---
    tags:
      - Menu management (staff only)
    consumes:
      - application/json
    parameters:
      - name: slug
        in: path
        type: string
        required: true
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            name:
              type: string
              example: Bun Maska
            price:
              type: number
              example: 30
            category:
              type: string
              example: Snacks
    responses:
      201:
        description: Item added
      400:
        description: Missing name or price
      401:
        description: Not logged in as this restaurant's admin
    """
    data = request.get_json()
    if not data or not data.get("name") or data.get("price") is None:
        return jsonify({"error": "name and price are required"}), 400

    db = get_db()
    restaurant = db.execute(
        "SELECT * FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()

    if restaurant is None:
        db.close()
        return jsonify({"error": "restaurant not found"}), 404

    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO menu_items (restaurant_id, name, price, category, is_available) "
        "VALUES (?, ?, ?, ?, 1)",
        (restaurant["id"], data["name"], data["price"], data.get("category", "")),
    )
    db.commit()
    new_id = cursor.lastrowid
    db.close()

    return jsonify({"id": new_id, "message": "item added"}), 201


@app.route("/api/admin/menu/<slug>/<int:item_id>", methods=["PUT"])
@login_required
def admin_edit_menu_item(slug, item_id):
    """Edit a menu item. Only send the fields you want to change. Staff only.
    ---
    tags:
      - Menu management (staff only)
    consumes:
      - application/json
    parameters:
      - name: slug
        in: path
        type: string
        required: true
      - name: item_id
        in: path
        type: integer
        required: true
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            name:
              type: string
            price:
              type: number
            category:
              type: string
            is_available:
              type: boolean
    responses:
      200:
        description: Item updated
      404:
        description: Item not found for this restaurant
      401:
        description: Not logged in as this restaurant's admin
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "no fields provided"}), 400

    db = get_db()
    # Confirm the item actually belongs to this restaurant before editing —
    # prevents one cafe's admin from editing another cafe's menu by guessing IDs.
    item = db.execute(
        """
        SELECT mi.* FROM menu_items mi
        JOIN restaurants r ON r.id = mi.restaurant_id
        WHERE mi.id = ? AND r.slug = ?
        """,
        (item_id, slug),
    ).fetchone()

    if item is None:
        db.close()
        return jsonify({"error": "menu item not found for this restaurant"}), 404

    name = data.get("name", item["name"])
    price = data.get("price", item["price"])
    category = data.get("category", item["category"])
    is_available = int(data.get("is_available", item["is_available"]))

    db.execute(
        "UPDATE menu_items SET name = ?, price = ?, category = ?, is_available = ? "
        "WHERE id = ?",
        (name, price, category, is_available, item_id),
    )
    db.commit()
    db.close()

    return jsonify({"id": item_id, "message": "item updated"})


@app.route("/api/admin/menu/<slug>/<int:item_id>", methods=["DELETE"])
@login_required
def admin_delete_menu_item(slug, item_id):
    """Delete a menu item. Blocked if the item is part of past orders. Staff only.
    ---
    tags:
      - Menu management (staff only)
    parameters:
      - name: slug
        in: path
        type: string
        required: true
      - name: item_id
        in: path
        type: integer
        required: true
    responses:
      200:
        description: Item deleted
      404:
        description: Item not found for this restaurant
      409:
        description: Item is part of past orders — mark unavailable instead
      401:
        description: Not logged in as this restaurant's admin
    """
    db = get_db()
    item = db.execute(
        """
        SELECT mi.* FROM menu_items mi
        JOIN restaurants r ON r.id = mi.restaurant_id
        WHERE mi.id = ? AND r.slug = ?
        """,
        (item_id, slug),
    ).fetchone()

    if item is None:
        db.close()
        return jsonify({"error": "menu item not found for this restaurant"}), 404

    # Don't hard-delete an item that's part of past orders — doing so would
    # break the bill/history for those old orders, since they look up the
    # item's name via this table. Point staff at "mark unavailable" instead.
    has_past_orders = db.execute(
        "SELECT 1 FROM order_items WHERE menu_item_id = ? LIMIT 1", (item_id,)
    ).fetchone()

    if has_past_orders:
        db.close()
        return jsonify({
            "error": "This item appears in past orders and can't be deleted. "
                     "Mark it unavailable instead (edit → is_available: false)."
        }), 409

    db.execute("DELETE FROM menu_items WHERE id = ?", (item_id,))
    db.commit()
    db.close()

    return jsonify({"id": item_id, "message": "item deleted"})


# ---------------------------------------------------------------------
# ACCOUNT (self-service password change)
# ---------------------------------------------------------------------

@app.route("/api/admin/change-password/<slug>", methods=["POST"])
@login_required
def admin_change_password(slug):
    """Change this restaurant's own admin password. Staff only —
    requires the CURRENT password as proof, not just an active session.
    ---
    tags:
      - Account (staff only)
    consumes:
      - application/json
    parameters:
      - name: slug
        in: path
        type: string
        required: true
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            current_password:
              type: string
            new_password:
              type: string
    responses:
      200:
        description: Password changed
      400:
        description: Missing fields or new password too short
      403:
        description: Current password is incorrect
    """
    data = request.get_json()
    current_password = (data or {}).get("current_password", "")
    new_password = (data or {}).get("new_password", "")

    if not current_password or not new_password:
        return jsonify({"error": "current_password and new_password are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "new password must be at least 6 characters"}), 400

    db = get_db()
    restaurant = db.execute(
        "SELECT * FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()

    # Requiring the current password here (not just a valid session) matters:
    # session cookies can be left logged in on a shared cafe device, so this
    # is the one action where we double-check identity even though the
    # session already passed login_required.
    if not restaurant["password_hash"] or not check_password_hash(
        restaurant["password_hash"], current_password
    ):
        db.close()
        return jsonify({"error": "current password is incorrect"}), 403

    db.execute(
        "UPDATE restaurants SET password_hash = ? WHERE slug = ?",
        (generate_password_hash(new_password), slug),
    )
    db.commit()
    db.close()

    return jsonify({"message": "password changed"})


# ---------------------------------------------------------------------
# ORDERS
# ---------------------------------------------------------------------

@app.route("/api/order", methods=["POST"])
def place_order():
    """Place a new order.
    ---
    tags:
      - Orders (public)
    consumes:
      - application/json
    parameters:
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            slug:
              type: string
              example: sunrise-cafe
            table_number:
              type: string
              example: "5"
            items:
              type: array
              items:
                type: object
                properties:
                  menu_item_id:
                    type: integer
                    example: 1
                  quantity:
                    type: integer
                    example: 2
    responses:
      201:
        description: Order placed
      400:
        description: Missing items or invalid menu item
      404:
        description: Restaurant not found
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
    """Get an order's status and computed bill.
    ---
    tags:
      - Orders (public)
    parameters:
      - name: order_id
        in: path
        type: integer
        required: true
        example: 1
    responses:
      200:
        description: Order status, line items, and total
      404:
        description: Order not found
    """
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
@login_required
def update_order_status(order_id):
    """Update an order's status. Requires staff login for the order's restaurant.
    ---
    tags:
      - Orders (staff only)
    consumes:
      - application/json
    parameters:
      - name: order_id
        in: path
        type: integer
        required: true
      - name: body
        in: body
        required: true
        schema:
          type: object
          properties:
            status:
              type: string
              enum: [pending, preparing, served, billed]
              example: preparing
    responses:
      200:
        description: Status updated
      400:
        description: Invalid status value
      401:
        description: Not logged in as this restaurant's admin
    """
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
@login_required
def list_active_orders(slug):
    """List all active (non-billed) orders for a restaurant. Staff only.
    ---
    tags:
      - Orders (staff only)
    parameters:
      - name: slug
        in: path
        type: string
        required: true
        example: sunrise-cafe
    responses:
      200:
        description: Active orders with line items and totals
      401:
        description: Not logged in as this restaurant's admin
    """
    db = get_db()
    restaurant = db.execute(
        "SELECT * FROM restaurants WHERE slug = ?", (slug,)
    ).fetchone()

    if restaurant is None:
        return jsonify({"error": "restaurant not found"}), 404

    orders = db.execute(
        "SELECT * FROM orders WHERE restaurant_id = ? AND status != 'billed' "
        "ORDER BY created_at ASC",
        (restaurant["id"],),
    ).fetchall()

    result = []
    for order in orders:
        line_items = db.execute(
            """
            SELECT oi.quantity, oi.price_at_order, mi.name
            FROM order_items oi
            JOIN menu_items mi ON mi.id = oi.menu_item_id
            WHERE oi.order_id = ?
            """,
            (order["id"],),
        ).fetchall()

        items = [
            {"name": row["name"], "quantity": row["quantity"], "price": row["price_at_order"]}
            for row in line_items
        ]
        total = sum(i["price"] * i["quantity"] for i in items)

        order_dict = dict(order)
        order_dict["items"] = items
        order_dict["total"] = round(total, 2)
        result.append(order_dict)

    db.close()
    return jsonify(result)


# ---------------------------------------------------------------------
# QR CODE GENERATION
# ---------------------------------------------------------------------

@app.route("/api/generate-qr/<slug>", methods=["GET"])
def generate_qr(slug):
    """Generate a QR code PNG pointing to this restaurant's menu page.
    ---
    tags:
      - Setup
    parameters:
      - name: slug
        in: path
        type: string
        required: true
        example: sunrise-cafe
    responses:
      200:
        description: QR code generated and saved to disk
    """
    os.makedirs("qr_codes", exist_ok=True)

    menu_url = f"{BASE_URL}/menu/{slug}"  # frontend route, once it exists
    img = qrcode.make(menu_url)
    path = f"qr_codes/{slug}.png"
    img.save(path)

    return jsonify({"slug": slug, "url": menu_url, "saved_to": path})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
