const state = {
  tableNumber: null,
  menu: { tabs: [], items: [] },
  activeTab: "Recommended",
  activeView: "menu",
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

const blockMessages = {
  missing: {
    heading: "Scan to order",
    message: "Scan your table's QR code to start ordering."
  },
  invalid: {
    heading: "QR no longer valid",
    message: "This QR code is no longer valid. Scan the current QR code at your table."
  }
};

function showBlockScreen(reason) {
  const copy = blockMessages[reason] || blockMessages.missing;
  $("#blockHeading").textContent = copy.heading;
  $("#blockMessage").textContent = copy.message;
  document.documentElement.classList.add("blocked");
}

function toastUnlessBlocked(message) {
  if (!document.documentElement.classList.contains("blocked")) showToast(message);
}

async function api(path, options) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 410) {
      showBlockScreen(state.session ? "invalid" : "missing");
    }
    throw new Error(body.error || "Request failed");
  }
  return body;
}

function quantityFor(id) {
  return state.cart.get(id) || 0;
}

function setQuantity(id, quantity) {
  if (quantity <= 0) state.cart.delete(id);
  else state.cart.set(id, quantity);
  renderMenu();
  renderBucket();
}

function tabs() {
  return state.menu.tabs.length ? state.menu.tabs : fallbackTabs;
}

function filteredItems() {
  const query = $("#searchInput").value.trim().toLowerCase();
  return state.menu.items.filter((item) => {
    const matchesTab = state.activeTab === "All Items" || item.category === state.activeTab;
    const matchesQuery = !query || `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase().includes(query);
    return matchesTab && matchesQuery;
  });
}

function setActiveView(view) {
  state.activeView = view;
  document.querySelectorAll(".appView").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === view));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
}

function openDrawer() {
  $("#categoryDrawer").classList.add("open");
  $("#drawerBackdrop").classList.add("open");
}

function closeDrawer() {
  $("#categoryDrawer").classList.remove("open");
  $("#drawerBackdrop").classList.remove("open");
}

function renderCategories() {
  $("#categoryList").innerHTML = tabs()
    .map((tab) => `<button class="categoryButton ${tab === state.activeTab ? "active" : ""}" type="button" data-tab="${tab}">${tab}</button>`)
    .join("");
  $("#activeCategoryTitle").textContent = state.activeTab;
}

function renderMenu() {
  renderCategories();
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

function renderBucket() {
  const lines = cartLines();
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  $("#cartCount").textContent = `${count} item${count === 1 ? "" : "s"}`;
  $("#cartTotal").textContent = money.format(currentCartTotal());
  $("#cartItems").innerHTML = lines.length
    ? lines.map((item) => `<div class="cartLine"><span>${item.quantity} x ${item.name}</span><strong>${money.format(item.price * item.quantity)}</strong></div>`).join("")
    : `<p class="empty">Choose dishes from the Menu tab.</p>`;
  $("#placeOrderButton").disabled = lines.length === 0;
}

function renderHistory() {
  const orders = state.session && state.session.orders ? state.session.orders : [];
  $("#historyList").innerHTML = orders.length
    ? orders
        .map((order) => `<article class="historyCard">
          <header><strong>${order.id}</strong><span>${money.format(order.totals.total)}</span></header>
          <ul>${order.items.map((item) => `<li>${item.quantity} x ${item.name}</li>`).join("")}</ul>
        </article>`)
        .join("")
    : `<p class="empty">No orders yet.</p>`;
}

function renderBarcode(value) {
  const text = String(value || `TABLE-${state.tableNumber}`);
  const bars = [...text].flatMap((char) => {
    const code = char.charCodeAt(0);
    return [
      `<span class="barcodeBar ${code % 2 ? "thin" : "wide"}"></span>`,
      `<span class="barcodeBar"></span>`
    ];
  }).join("");
  $("#checkoutBarcode").innerHTML = `<div>${bars}<span class="barcodeText">${text}</span></div>`;
}

function renderSession() {
  const session = state.session;
  $("#tableTitle").textContent = `Table ${state.tableNumber}`;
  $("#sessionStatus").textContent = session ? session.status : "Welcome";
  $("#slipNumber").textContent = session && session.slipNumber ? session.slipNumber : "No slip yet";
  renderTotals(session ? session.totals : { subtotal: 0, serviceFee: 0, tax: 0, total: 0 });
  renderHistory();
  renderBarcode(session && session.slipNumber);
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
    body: JSON.stringify({ items })
  });
  state.session = result.session;
  state.cart.clear();
  renderSession();
  renderBucket();
  renderMenu();
  setActiveView("history");
  showToast(`Order sent. Slip ${result.session.slipNumber}`);
}

async function callStaff() {
  await api("/api/staff-calls", {
    method: "POST",
    body: JSON.stringify({ reason: "Customer requested staff" })
  });
  showToast("Staff call sent.");
}

async function init() {
  const [menu, sessionResult] = await Promise.all([
    api("/api/menu"),
    api("/api/session")
  ]);
  state.menu = menu;
  state.session = sessionResult.session;
  state.tableNumber = sessionResult.session.tableNumber;
  renderSession();
  renderMenu();
  renderBucket();
}

document.addEventListener("click", (event) => {
  const inc = event.target.closest("[data-inc]");
  const dec = event.target.closest("[data-dec]");
  const tab = event.target.closest("[data-tab]");
  const view = event.target.closest("[data-view]");
  if (inc) setQuantity(inc.dataset.inc, quantityFor(inc.dataset.inc) + 1);
  if (dec) setQuantity(dec.dataset.dec, quantityFor(dec.dataset.dec) - 1);
  if (tab) {
    state.activeTab = tab.dataset.tab;
    closeDrawer();
    renderMenu();
  }
  if (view) setActiveView(view.dataset.view);
});

$("#openCategoryDrawer").addEventListener("click", openDrawer);
$("#closeCategoryDrawer").addEventListener("click", closeDrawer);
$("#drawerBackdrop").addEventListener("click", closeDrawer);
$("#searchInput").addEventListener("input", renderMenu);
$("#splitCount").addEventListener("input", () => renderSession());
$("#placeOrderButton").addEventListener("click", () => placeOrder().catch((error) => toastUnlessBlocked(error.message)));
$("#callStaffButton").addEventListener("click", () => callStaff().catch((error) => toastUnlessBlocked(error.message)));

const params = new URLSearchParams(window.location.search);
if (params.get("e") === "expired") {
  showBlockScreen("invalid");
} else {
  init().catch((error) => toastUnlessBlocked(error.message));
}
