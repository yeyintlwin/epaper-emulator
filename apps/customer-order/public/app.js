const state = {
  tableNumber: 1,
  menu: { tabs: [], items: [] },
  activeTab: "Recommended",
  cart: new Map(),
  session: null
};

const fallbackTabs = ["Recommended", "All Items", "Service & Utensils", "Desserts", "Soft Drinks", "Alcoholic Drinks"];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
});

const $ = (selector) => document.querySelector(selector);

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function getTableNumber() {
  const params = new URLSearchParams(window.location.search);
  const value = Number(params.get("table_number") || params.get("table") || 1);
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : 1;
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function quantityFor(id) {
  return state.cart.get(id) || 0;
}

function setQuantity(id, quantity) {
  if (quantity <= 0) state.cart.delete(id);
  else state.cart.set(id, quantity);
  renderMenu();
  renderCart();
}

function filteredItems() {
  const query = $("#searchInput").value.trim().toLowerCase();
  return state.menu.items.filter((item) => {
    const matchesTab = state.activeTab === "All Items" || item.category === state.activeTab || (state.activeTab === "All Items" && item.category !== "Service & Utensils");
    const matchesQuery = !query || `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes(query);
    return matchesTab && matchesQuery;
  });
}

function renderTabs() {
  const tabs = state.menu.tabs.length ? state.menu.tabs : fallbackTabs;
  $("#menuTabs").innerHTML = tabs
    .map((tab) => `<button class="tabButton ${tab === state.activeTab ? "active" : ""}" type="button" data-tab="${tab}">${tab}</button>`)
    .join("");
}

function renderMenu() {
  renderTabs();
  const items = filteredItems();
  $("#menuList").innerHTML = items.length
    ? items
        .map((item) => {
          const qty = quantityFor(item.id);
          return `<article class="menuItem">
            <div class="dishMark">${item.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <h3>${item.name}</h3>
              <p>${item.description}</p>
              <strong>${money.format(item.price)}</strong>
            </div>
            <div class="stepper" aria-label="${item.name} quantity">
              <button type="button" data-dec="${item.id}">-</button>
              <span>${qty}</span>
              <button type="button" data-inc="${item.id}">+</button>
            </div>
          </article>`;
        })
        .join("")
    : `<p class="empty">No items found.</p>`;
}

function cartLines() {
  return [...state.cart.entries()].map(([id, quantity]) => {
    const item = state.menu.items.find((menuItem) => menuItem.id === id);
    return { ...item, quantity };
  });
}

function currentCartTotal() {
  return cartLines().reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function renderCart() {
  const lines = cartLines();
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  $("#cartCount").textContent = `${count} item${count === 1 ? "" : "s"}`;
  $("#cartTotal").textContent = money.format(currentCartTotal());
  $("#cartItems").innerHTML = lines.length
    ? lines.map((item) => `<div class="cartLine"><span>${item.quantity} x ${item.name}</span><strong>${money.format(item.price * item.quantity)}</strong></div>`).join("")
    : "Choose dishes to begin.";
  $("#placeOrderButton").disabled = lines.length === 0;
}

function renderSession() {
  const session = state.session;
  $("#tableTitle").textContent = `Table ${state.tableNumber}`;
  $("#sessionStatus").textContent = session ? session.status : "Welcome";
  $("#slipNumber").textContent = session && session.slipNumber ? session.slipNumber : "No slip yet";
  renderTotals(session ? session.totals : { subtotal: 0, serviceFee: 0, tax: 0, total: 0 });
}

function renderTotals(totals) {
  $("#totals").innerHTML = [
    ["Subtotal", totals.subtotal],
    ["Service fee", totals.serviceFee],
    ["Tax", totals.tax],
    ["Total", totals.total]
  ].map(([label, amount]) => `<div class="totalLine"><span>${label}</span><strong>${money.format(amount)}</strong></div>`).join("");
  const splitCount = Math.max(1, Number($("#splitCount").value || 1));
  $("#splitResult").textContent = `${money.format(Math.ceil(totals.total / splitCount))} per person`;
}

async function placeOrder() {
  const items = cartLines().map((item) => ({ id: item.id, quantity: item.quantity }));
  const result = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ table_number: state.tableNumber, items })
  });
  state.session = result.session;
  state.cart.clear();
  renderSession();
  renderCart();
  renderMenu();
  showToast(`Order sent. Slip ${result.session.slipNumber}`);
}

async function callStaff() {
  await api("/api/staff-calls", {
    method: "POST",
    body: JSON.stringify({ table_number: state.tableNumber, reason: "Customer requested staff" })
  });
  showToast("Staff call sent.");
}

async function init() {
  state.tableNumber = getTableNumber();
  const [menu, sessionResult] = await Promise.all([
    api("/api/menu"),
    api(`/api/session?table_number=${state.tableNumber}`)
  ]);
  state.menu = menu;
  state.session = sessionResult.session;
  renderSession();
  renderMenu();
  renderCart();
}

document.addEventListener("click", (event) => {
  const inc = event.target.closest("[data-inc]");
  const dec = event.target.closest("[data-dec]");
  const tab = event.target.closest("[data-tab]");
  if (inc) setQuantity(inc.dataset.inc, quantityFor(inc.dataset.inc) + 1);
  if (dec) setQuantity(dec.dataset.dec, quantityFor(dec.dataset.dec) - 1);
  if (tab) {
    state.activeTab = tab.dataset.tab;
    renderMenu();
  }
});

$("#searchInput").addEventListener("input", renderMenu);
$("#splitCount").addEventListener("input", () => renderSession());
$("#placeOrderButton").addEventListener("click", () => placeOrder().catch((error) => showToast(error.message)));
$("#callStaffButton").addEventListener("click", () => callStaff().catch((error) => showToast(error.message)));

init().catch((error) => showToast(error.message));
