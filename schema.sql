-- Run this once to create the database: sqlite3 cafe.db < schema.sql

DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS order_items;

CREATE TABLE restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL      -- used in the QR code URL, e.g. "sunrise-cafe"
);

CREATE TABLE menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category TEXT,                 -- e.g. "Starters", "Main Course", "Beverages"
    is_available INTEGER DEFAULT 1,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL,
    table_number TEXT,
    status TEXT DEFAULT 'pending',  -- pending -> preparing -> served -> billed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_at_order REAL NOT NULL,   -- snapshot price in case menu price changes later
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

-- Sample seed data so you have something to test against immediately
INSERT INTO restaurants (name, slug) VALUES ('Demo Cafe', 'demo-cafe');

INSERT INTO menu_items (restaurant_id, name, price, category) VALUES
    (1, 'Masala Chai', 20.0, 'Beverages'),
    (1, 'Veg Puff', 25.0, 'Snacks'),
    (1, 'Idli (2 pcs)', 40.0, 'Breakfast'),
    (1, 'Filter Coffee', 25.0, 'Beverages');
