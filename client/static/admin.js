// ============================================================
// admin.js — polls the backend every few seconds and re-renders
// the three columns. No websockets needed for a beginner project;
// polling is simpler to reason about and plenty fast for a cafe.
// ============================================================

const slug = document.body.dataset.slug;
const POLL_INTERVAL_MS = 4000;

const restaurantLabel = document.getElementById('restaurant-label');
const columns = {
  pending: document.getElementById('col-pending'),
  preparing: document.getElementById('col-preparing'),
  served: document.getElementById('col-served'),
};

// What button each column's tickets should show, and what status
// clicking it should move the order to. This is the whole state
// machine for the kitchen workflow, in one place.
const NEXT_STATUS = {
  pending: { label: 'Start preparing', next: 'preparing' },
  preparing: { label: 'Mark served', next: 'served' },
  served: { label: 'Mark billed', next: 'billed' },
};

async function fetchOrders() {
  try {
    const response = await fetch(`/api/orders/${slug}`);
    if (!response.ok) return;
    const orders = await response.json();
    renderOrders(orders);
  } catch (err) {
    console.error('Failed to fetch orders:', err);
  }
}

function renderOrders(orders) {
  // Clear all columns before re-rendering
  Object.values(columns).forEach(col => (col.innerHTML = ''));

  if (orders.length > 0) {
    restaurantLabel.textContent = `${orders.length} active order(s)`;
  } else {
    restaurantLabel.textContent = 'No active orders';
  }

  // Group orders into their column by status.
  // "billed" orders are excluded by the backend already, so we only
  // ever see pending / preparing / served here.
  orders.forEach(order => {
    const column = columns[order.status];
    if (!column) return; // unknown status, skip defensively

    column.appendChild(buildTicketElement(order));
  });

  // Show a quiet placeholder in empty columns instead of leaving
  // them looking broken/blank
  Object.entries(columns).forEach(([status, col]) => {
    if (col.children.length === 0) {
      const note = document.createElement('div');
      note.className = 'empty-note';
      note.textContent = 'nothing here';
      col.appendChild(note);
    }
  });
}

function buildTicketElement(order) {
  const ticket = document.createElement('div');
  ticket.className = 'order-ticket';

  const itemsHtml = order.items
    .map(i => `<li><span>${i.name} x${i.quantity}</span><span>₹${(i.price * i.quantity).toFixed(2)}</span></li>`)
    .join('');

  const stepInfo = NEXT_STATUS[order.status];
  const time = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  ticket.innerHTML = `
    <div class="ticket-top">
      <span>ORDER #${order.id}</span>
      <span class="table-tag">TABLE ${order.table_number || '-'}</span>
    </div>
    <ul>${itemsHtml}</ul>
    <div class="ticket-total">
      <span>TOTAL</span>
      <span>₹${order.total.toFixed(2)}</span>
    </div>
    <button type="button">${stepInfo.label}</button>
    <div class="timestamp">${time}</div>
  `;

  ticket.querySelector('button').addEventListener('click', () => {
    advanceStatus(order.id, stepInfo.next);
  });

  return ticket;
}

async function advanceStatus(orderId, newStatus) {
  try {
    await fetch(`/api/order/${orderId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    // Re-fetch immediately after a status change so the board
    // updates without waiting for the next poll cycle
    fetchOrders();
  } catch (err) {
    console.error('Failed to update status:', err);
  }
}

// Initial load, then poll on an interval
fetchOrders();
setInterval(fetchOrders, POLL_INTERVAL_MS);

// ============================================================
// Tab switching between "Orders" and "Manage Menu" views
// ============================================================

const ordersView = document.getElementById('orders-view');
const menuView = document.getElementById('menu-view');
const accountView = document.getElementById('account-view');
const tabs = document.querySelectorAll('.admin-tab');

const views = {
  orders: ordersView,
  menu: menuView,
  account: accountView,
};

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const selected = tab.dataset.view;
    Object.entries(views).forEach(([name, el]) => {
      el.classList.toggle('hidden', name !== selected);
    });

    if (selected === 'menu') {
      fetchMenuItems(); // refresh each time the tab is opened
    }
  });
});

// ============================================================
// Menu management — add / edit / delete items
// ============================================================

const menuItemListEl = document.getElementById('menu-item-list');
const addItemForm = document.getElementById('add-item-form');
const newItemName = document.getElementById('new-item-name');
const newItemPrice = document.getElementById('new-item-price');
const newItemCategory = document.getElementById('new-item-category');

async function fetchMenuItems() {
  try {
    const response = await fetch(`/api/admin/menu/${slug}`);
    if (!response.ok) return;
    const items = await response.json();
    renderMenuItemList(items);
  } catch (err) {
    console.error('Failed to fetch menu items:', err);
  }
}

function renderMenuItemList(items) {
  menuItemListEl.innerHTML = '';

  if (items.length === 0) {
    menuItemListEl.innerHTML = '<div class="empty-note">No menu items yet — add one above.</div>';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'menu-manage-row' + (item.is_available ? '' : ' unavailable');

    // Each field is independently editable inline — no separate "edit mode"
    // screen, since staff will do this quickly between orders.
    row.innerHTML = `
      <input type="text" value="${item.name}" class="edit-name">
      <input type="number" value="${item.price}" step="0.01" class="edit-price">
      <input type="text" value="${item.category || ''}" class="edit-category" placeholder="Category">
      <label class="avail-toggle">
        <input type="checkbox" class="edit-available" ${item.is_available ? 'checked' : ''}>
        Available
      </label>
      <button type="button" class="save-btn">Save</button>
      <button type="button" class="delete-btn">Delete</button>
    `;

    row.querySelector('.save-btn').addEventListener('click', () => {
      saveMenuItem(item.id, {
        name: row.querySelector('.edit-name').value,
        price: parseFloat(row.querySelector('.edit-price').value),
        category: row.querySelector('.edit-category').value,
        is_available: row.querySelector('.edit-available').checked,
      });
    });

    row.querySelector('.delete-btn').addEventListener('click', () => {
      deleteMenuItem(item.id, item.name);
    });

    menuItemListEl.appendChild(row);
  });
}

addItemForm.addEventListener('submit', async (e) => {
  e.preventDefault(); // stop the browser's default full-page form submit

  const payload = {
    name: newItemName.value,
    price: parseFloat(newItemPrice.value),
    category: newItemCategory.value,
  };

  try {
    const response = await fetch(`/api/admin/menu/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const result = await response.json();
      alert(result.error || 'Could not add item');
      return;
    }

    addItemForm.reset();
    fetchMenuItems();
  } catch (err) {
    console.error('Failed to add item:', err);
  }
});

async function saveMenuItem(itemId, updates) {
  try {
    const response = await fetch(`/api/admin/menu/${slug}/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const result = await response.json();
      alert(result.error || 'Could not save changes');
      return;
    }

    fetchMenuItems(); // re-render with confirmed saved state
  } catch (err) {
    console.error('Failed to save item:', err);
  }
}

async function deleteMenuItem(itemId, itemName) {
  if (!confirm(`Delete "${itemName}"? This can't be undone.`)) return;

  try {
    const response = await fetch(`/api/admin/menu/${slug}/${itemId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const result = await response.json();
      // e.g. blocked because it's part of past orders — explain why
      alert(result.error || 'Could not delete item');
      return;
    }

    fetchMenuItems();
  } catch (err) {
    console.error('Failed to delete item:', err);
  }
}

// ============================================================
// Account — self-service password change
// ============================================================

const changePasswordForm = document.getElementById('change-password-form');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const passwordChangeStatus = document.getElementById('password-change-status');

changePasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (newPasswordInput.value !== confirmPasswordInput.value) {
    passwordChangeStatus.textContent = "New passwords don't match.";
    passwordChangeStatus.className = 'error';
    return;
  }

  try {
    const response = await fetch(`/api/admin/change-password/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPasswordInput.value,
        new_password: newPasswordInput.value,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      passwordChangeStatus.textContent = result.error || 'Could not change password';
      passwordChangeStatus.className = 'error';
      return;
    }

    passwordChangeStatus.textContent = 'Password updated.';
    passwordChangeStatus.className = 'success';
    changePasswordForm.reset();
  } catch (err) {
    passwordChangeStatus.textContent = 'Network error — is the server running?';
    passwordChangeStatus.className = 'error';
    console.error(err);
  }
});
