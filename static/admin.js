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
