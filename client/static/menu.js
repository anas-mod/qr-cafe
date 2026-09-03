// ============================================================
// menu.js — vanilla JavaScript, no framework.
// ============================================================

const slug = document.body.dataset.slug;

// Cart lives as a plain JS object in memory: { menuItemId: {name, price, quantity} }
let cart = {};
let fullMenu = [];
let trackingOrderId = null;
let trackingIntervalId = null;

// ---- Cache DOM elements ----
const menuScreen = document.getElementById('menu-screen');
const trackingScreen = document.getElementById('tracking-screen');

const cafeNameEl = document.getElementById('cafe-name');
const tabsEl = document.getElementById('category-tabs');
const menuListEl = document.getElementById('menu-list');

const billBar = document.getElementById('bill-bar');
const billCountEl = document.getElementById('bill-count');
const billTotalEl = document.getElementById('bill-total');

const ticketEl = document.getElementById('order-ticket');
const closeTicketBtn = document.getElementById('close-ticket');
const ticketItemsEl = document.getElementById('ticket-items');
const ticketTotalEl = document.getElementById('ticket-total-amount');
const placeOrderBtn = document.getElementById('place-order-btn');
const tableNumberInput = document.getElementById('table-number');
const orderStatusEl = document.getElementById('order-status');

const trackingItemsEl = document.getElementById('tracking-items');
const trackingTotalEl = document.getElementById('tracking-total');
const trackingSubtitle = document.getElementById('tracking-subtitle');
const newOrderBtn = document.getElementById('new-order-btn');

// ------------------------------------------------------------
// 1. Load menu
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
    cafeNameEl.textContent = 'Could not load menu';
    console.error(err);
  }
}

// ------------------------------------------------------------
// 2. Category tabs
// ------------------------------------------------------------
function renderCategoryTabs(items) {
  const categories = ['All', ...new Set(items.map(i => i.category))];

  tabsEl.innerHTML = '';
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
// 3. Menu items — each with a quantity stepper instead of a
//    single "Add" button, so the current quantity is always
//    visible right on the card, not just in the cart panel.
// ------------------------------------------------------------
function renderMenuItems(items) {
  menuListEl.innerHTML = '';

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'menu-item';
    row.dataset.itemId = item.id;

    const currentQty = cart[item.id] ? cart[item.id].quantity : 0;

    row.innerHTML = `
      <div class="menu-item-info">
        <div class="name">${item.name}</div>
        <div class="category-label">${item.category || ''}</div>
        <div class="price">₹${item.price}</div>
      </div>
      <div class="stepper" data-item-id="${item.id}">
        <button type="button" class="stepper-minus" ${currentQty === 0 ? 'style="visibility:hidden"' : ''}>−</button>
        <span class="stepper-qty">${currentQty}</span>
        <button type="button" class="stepper-plus">+</button>
      </div>
    `;

    row.querySelector('.stepper-plus').addEventListener('click', () => addToCart(item));
    row.querySelector('.stepper-minus').addEventListener('click', () => removeFromCart(item.id));

    menuListEl.appendChild(row);
  });
}

// Updates just one item's stepper display, without re-rendering
// the whole menu grid (keeps scroll position, feels instant)
function updateStepperDisplay(itemId) {
  const stepperEl = menuListEl.querySelector(`.stepper[data-item-id="${itemId}"]`);
  if (!stepperEl) return;

  const qty = cart[itemId] ? cart[itemId].quantity : 0;
  stepperEl.querySelector('.stepper-qty').textContent = qty;
  stepperEl.querySelector('.stepper-minus').style.visibility = qty === 0 ? 'hidden' : 'visible';
}

// ------------------------------------------------------------
// 4. Cart logic — every change immediately recalculates the
//    bill, so the total shown is always live, never stale.
// ------------------------------------------------------------
function addToCart(item) {
  if (cart[item.id]) {
    cart[item.id].quantity += 1;
  } else {
    cart[item.id] = { name: item.name, price: item.price, quantity: 1 };
  }
  updateStepperDisplay(item.id);
  renderBill();
}

function removeFromCart(itemId) {
  if (!cart[itemId]) return;
  cart[itemId].quantity -= 1;
  if (cart[itemId].quantity <= 0) {
    delete cart[itemId];
  }
  updateStepperDisplay(itemId);
  renderBill();
}

// Recalculates and redraws EVERYTHING bill-related: the always-visible
// bottom bar AND the detailed ticket panel — this is what makes the
// bill "live" rather than something computed only at checkout.
function renderBill() {
  const itemIds = Object.keys(cart);
  const totalCount = itemIds.reduce((sum, id) => sum + cart[id].quantity, 0);
  let total = 0;

  ticketItemsEl.innerHTML = '';

  itemIds.forEach(id => {
    const entry = cart[id];
    const lineTotal = entry.price * entry.quantity;
    total += lineTotal;

    const li = document.createElement('li');
    li.innerHTML = `
      <span>${entry.name} x${entry.quantity}</span>
      <span>₹${lineTotal.toFixed(2)}</span>
    `;
    ticketItemsEl.appendChild(li);
  });

  billCountEl.textContent = totalCount;
  billTotalEl.textContent = total.toFixed(2);
  ticketTotalEl.textContent = `₹${total.toFixed(2)}`;

  billBar.classList.toggle('disabled', totalCount === 0);
}

// ------------------------------------------------------------
// 5. Ticket (detailed cart panel) open/close
// ------------------------------------------------------------
billBar.addEventListener('click', () => {
  if (billBar.classList.contains('disabled')) return; // nothing to show yet
  ticketEl.classList.remove('hidden');
});

closeTicketBtn.addEventListener('click', () => {
  ticketEl.classList.add('hidden');
});

// ------------------------------------------------------------
// 6. Place the order, then switch to the live tracking screen
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

    trackingOrderId = result.order_id;
    cart = {};
    ticketEl.classList.add('hidden');
    orderStatusEl.textContent = '';
    showTrackingScreen();
  } catch (err) {
    orderStatusEl.textContent = 'Network error — is the server running?';
    console.error(err);
  } finally {
    placeOrderBtn.disabled = false;
  }
});

// ------------------------------------------------------------
// 7. Live order tracking — this is where the bill stays visible
//    and up to date AFTER ordering too, not just before.
// ------------------------------------------------------------
function showTrackingScreen() {
  menuScreen.classList.add('hidden');
  trackingScreen.classList.remove('hidden');

  pollOrderStatus(); // immediately, then repeat
  trackingIntervalId = setInterval(pollOrderStatus, 3000);
}

async function pollOrderStatus() {
  if (!trackingOrderId) return;

  try {
    const response = await fetch(`/api/order/${trackingOrderId}`);
    if (!response.ok) return;
    const data = await response.json();

    renderTracking(data);

    // Stop polling once the order reaches a terminal state — no need
    // to keep hitting the server once billed.
    if (data.status === 'billed') {
      clearInterval(trackingIntervalId);
    }
  } catch (err) {
    console.error('Failed to poll order status:', err);
  }
}

function renderTracking(data) {
  trackingSubtitle.textContent = `Table ${data.table_number || '—'} · Order #${data.order_id}`;

  document.querySelectorAll('.status-stepper .step').forEach(stepEl => {
    stepEl.classList.remove('active', 'done');
  });

  const order = ['pending', 'preparing', 'served', 'billed'];
  const currentIndex = order.indexOf(data.status);

  order.forEach((status, index) => {
    if (status === 'billed') return; // billed has no visible step dot — served is the last one shown
    const stepEl = document.querySelector(`.status-stepper .step[data-status="${status}"]`);
    if (!stepEl) return;
    if (index < currentIndex) stepEl.classList.add('done');
    if (index === currentIndex) stepEl.classList.add('active');
  });

  trackingItemsEl.innerHTML = '';
  data.items.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${item.name} x${item.quantity}</span>
      <span>₹${item.subtotal.toFixed(2)}</span>
    `;
    trackingItemsEl.appendChild(li);
  });

  trackingTotalEl.textContent = `₹${data.total.toFixed(2)}`;
}

newOrderBtn.addEventListener('click', () => {
  clearInterval(trackingIntervalId);
  trackingOrderId = null;
  trackingScreen.classList.add('hidden');
  menuScreen.classList.remove('hidden');
  renderMenuItems(fullMenu); // reset all steppers to 0
  renderBill();
});

// ------------------------------------------------------------
// Kick things off
// ------------------------------------------------------------
loadMenu();
