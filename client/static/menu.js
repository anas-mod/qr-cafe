// ============================================================
// menu.js — vanilla JavaScript, no framework.
// Commented in detail since this is meant to teach as you read it.
// ============================================================

// Read the restaurant slug that Flask embedded in the <body data-slug="...">
// This is how a plain HTML page can know "which cafe" it's showing,
// without any routing library.
const slug = document.body.dataset.slug;

// Cart lives as a plain JS object in memory: { menuItemId: {name, price, quantity} }
// No localStorage (per the rules for this kind of embedded/dynamic content) —
// it just needs to survive while the tab is open.
let cart = {};

// Cache DOM elements we'll touch repeatedly, so we don't re-query each time
const cafeNameEl = document.getElementById('cafe-name');
const tabsEl = document.getElementById('category-tabs');
const menuListEl = document.getElementById('menu-list');
const cartToggleBtn = document.getElementById('cart-toggle');
const cartCountEl = document.getElementById('cart-count');
const ticketEl = document.getElementById('order-ticket');
const closeTicketBtn = document.getElementById('close-ticket');
const ticketItemsEl = document.getElementById('ticket-items');
const ticketTotalEl = document.getElementById('ticket-total-amount');
const placeOrderBtn = document.getElementById('place-order-btn');
const tableNumberInput = document.getElementById('table-number');
const orderStatusEl = document.getElementById('order-status');

let fullMenu = []; // holds all items so we can filter by category client-side

// ------------------------------------------------------------
// 1. Fetch the menu from the Flask backend when the page loads
// ------------------------------------------------------------
async function loadMenu() {
  try {
    const response = await fetch(`/api/menu/${slug}`);
    if (!response.ok) {
      cafeNameEl.textContent = 'Menu not found';
      return;
    }
    const data = await response.json();
    cafeNameEl.textContent = data.restaurant;
    fullMenu = data.menu;

    renderCategoryTabs(fullMenu);
    renderMenuItems(fullMenu);
  } catch (err) {
    // Network error, backend not running, etc.
    cafeNameEl.textContent = 'Could not load menu';
    console.error(err);
  }
}

// ------------------------------------------------------------
// 2. Build category tabs from whatever categories exist in the data
//    (no hardcoding — works for any cafe's menu automatically)
// ------------------------------------------------------------
function renderCategoryTabs(items) {
  const categories = ['All', ...new Set(items.map(i => i.category))];

  tabsEl.innerHTML = ''; // clear before rebuilding
  categories.forEach((cat, index) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (index === 0 ? ' active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const filtered = cat === 'All' ? items : items.filter(i => i.category === cat);
      renderMenuItems(filtered);
    });
    tabsEl.appendChild(btn);
  });
}

// ------------------------------------------------------------
// 3. Render the menu items themselves, each with an "Add" button
// ------------------------------------------------------------
function renderMenuItems(items) {
  menuListEl.innerHTML = '';

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'menu-item';

    row.innerHTML = `
      <div>
        <div class="name">${item.name}</div>
        <div class="category-label">${item.category || ''}</div>
      </div>
      <div style="display:flex; align-items:center;">
        <span class="price">₹${item.price}</span>
        <button type="button">Add</button>
      </div>
    `;

    // addEventListener instead of inline onclick — cleaner separation
    // of HTML and behaviour, and avoids escaping issues with the item name
    row.querySelector('button').addEventListener('click', () => addToCart(item));

    menuListEl.appendChild(row);
  });
}

// ------------------------------------------------------------
// 4. Cart logic
// ------------------------------------------------------------
function addToCart(item) {
  if (cart[item.id]) {
    cart[item.id].quantity += 1;
  } else {
    cart[item.id] = { name: item.name, price: item.price, quantity: 1 };
  }
  renderCart();
}

function removeFromCart(itemId) {
  if (!cart[itemId]) return;
  cart[itemId].quantity -= 1;
  if (cart[itemId].quantity <= 0) {
    delete cart[itemId];
  }
  renderCart();
}

function renderCart() {
  const itemIds = Object.keys(cart);
  const totalCount = itemIds.reduce((sum, id) => sum + cart[id].quantity, 0);
  cartCountEl.textContent = totalCount;

  ticketItemsEl.innerHTML = '';
  let total = 0;

  itemIds.forEach(id => {
    const entry = cart[id];
    const lineTotal = entry.price * entry.quantity;
    total += lineTotal;

    const li = document.createElement('li');
    li.innerHTML = `
      <span>${entry.name} x${entry.quantity}</span>
      <span>
        ₹${lineTotal.toFixed(2)}
        <button type="button" data-id="${id}" style="margin-left:8px;">-</button>
      </span>
    `;
    li.querySelector('button').addEventListener('click', () => removeFromCart(id));
    ticketItemsEl.appendChild(li);
  });

  ticketTotalEl.textContent = `₹${total.toFixed(2)}`;
}

// ------------------------------------------------------------
// 5. Ticket (cart panel) open/close
// ------------------------------------------------------------
cartToggleBtn.addEventListener('click', () => {
  ticketEl.classList.remove('hidden');
});

closeTicketBtn.addEventListener('click', () => {
  ticketEl.classList.add('hidden');
});

// ------------------------------------------------------------
// 6. Submit the order to the backend
// ------------------------------------------------------------
placeOrderBtn.addEventListener('click', async () => {
  const itemIds = Object.keys(cart);

  if (itemIds.length === 0) {
    orderStatusEl.textContent = 'Add at least one item first.';
    return;
  }

  const payload = {
    slug: slug,
    table_number: tableNumberInput.value || null,
    items: itemIds.map(id => ({
      menu_item_id: parseInt(id),
      quantity: cart[id].quantity,
    })),
  };

  placeOrderBtn.disabled = true;
  orderStatusEl.textContent = 'Placing order…';

  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      orderStatusEl.textContent = `Error: ${result.error || 'could not place order'}`;
      placeOrderBtn.disabled = false;
      return;
    }

    orderStatusEl.textContent = `Order #${result.order_id} placed! Status: ${result.status}`;
    cart = {}; // clear cart after successful order
    renderCart();
  } catch (err) {
    orderStatusEl.textContent = 'Network error — is the server running?';
    console.error(err);
  } finally {
    placeOrderBtn.disabled = false;
  }
});

// ------------------------------------------------------------
// Kick things off
// ------------------------------------------------------------
loadMenu();
