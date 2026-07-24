const CATEGORY_TINT = {
  "Recommended":        { bg: "#fdecea", fg: "#c81e0f" },
  "All Items":          { bg: "#eef1f6", fg: "#475569" },
  "Service & Utensils": { bg: "#fff4e5", fg: "#b26a00" },
  "Desserts":           { bg: "#fdeef4", fg: "#be185d" },
  "Soft Drinks":        { bg: "#e7f6f2", fg: "#0f766e" },
  "Alcoholic Drinks":   { bg: "#ecebfa", fg: "#4f46e5" }
};
const tintFor = (cat) => CATEGORY_TINT[cat] || { bg: "#eef1f6", fg: "#475569" };

const fallbackTabs = ["Recommended", "All Items", "Service & Utensils", "Desserts", "Soft Drinks", "Alcoholic Drinks"];

const state = {
  tableNumber: null,
  menu: { tabs: [], items: [] },
  activeTab: "Recommended",
  activeView: "menu",
  cart: new Map(),
  session: null,
  ageVerified: false,
  dessertTiming: new Map(),
  pending: null
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const $ = (s) => document.querySelector(s);

// Menu content (names, ids, image URLs) originates from admin input served by the
// backend, so treat it as untrusted when building HTML. esc() neutralises markup;
// safeImageUrl() only allows http(s)/relative URLs (blocks javascript:, data:, breakouts).
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeImageUrl = (url) => (/^(?:https?:\/\/|\/)[^"'<>\s]*$/i.test(String(url || "")) ? String(url) : "");

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

function tabs() { return state.menu.tabs.length ? state.menu.tabs : fallbackTabs; }

function quantityFor(id) { return state.cart.get(id) || 0; }
function setQuantity(id, quantity) {
  if (quantity <= 0) { state.cart.delete(id); state.dessertTiming.delete(id); }
  else state.cart.set(id, quantity);
  renderMenu();
  renderBucket();
}

function isDessert(item) { return item && item.category === "Desserts"; }
function isAlcohol(item) { return item && item.category === "Alcoholic Drinks"; }

// Add flow with gates: alcohol -> 21+ age check, dessert -> serving-time choice.
function requestAdd(id) {
  const item = state.menu.items.find((m) => m.id === id);
  if (!item) return;
  if (isAlcohol(item) && !state.ageVerified) { openAgeGate(id); return; }
  if (isDessert(item) && quantityFor(id) === 0 && !state.dessertTiming.has(id)) { openDessertSheet(id); return; }
  setQuantity(id, quantityFor(id) + 1);
}

function openAgeGate(id) { state.pending = id; $("#ageGate").hidden = false; }
function closeAgeGate() { $("#ageGate").hidden = true; state.pending = null; }
function openDessertSheet(id) { state.pending = id; $("#dessertSheet").hidden = false; $("#dessertBackdrop").hidden = false; }
function closeDessertSheet() { $("#dessertSheet").hidden = true; $("#dessertBackdrop").hidden = true; state.pending = null; }

function monogram(name) {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
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
  document.querySelectorAll(".view").forEach((p) => p.classList.toggle("active", p.dataset.panel === view));
  document.querySelectorAll(".navItem[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  window.scrollTo({ top: 0 });
}

function openDrawer() {
  $("#categoryDrawer").classList.add("open");
  $("#categoryDrawer").setAttribute("aria-hidden", "false");
  $("#drawerBackdrop").classList.add("open");
}
function closeDrawer() {
  $("#categoryDrawer").classList.remove("open");
  $("#categoryDrawer").setAttribute("aria-hidden", "true");
  $("#drawerBackdrop").classList.remove("open");
}

const CATEGORY_ICON = {
  "Recommended": `<path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>`,
  "All Items": `<path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z"/>`,
  "Service & Utensils": `<path d="M8.1 13.34l2.83-2.83L3.91 3.5a4 4 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"/>`,
  "Desserts": `<path d="M12 6a2 2 0 0 0 2-2c0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03a2 2 0 0 0 2 2zm6 3h-5V7h-2v2H6c-1.66 0-3 1.34-3 3v1.54c0 1.08.88 1.96 1.96 1.96.52 0 1.02-.2 1.38-.57l2.14-2.13 2.13 2.13c.74.74 2.03.74 2.77 0l2.14-2.13 2.13 2.13c.37.37.86.57 1.38.57 1.08 0 1.96-.88 1.96-1.96V12c0-1.66-1.34-3-3-3zm1 7.99c-.53-.02-1.03-.24-1.44-.65l-1.07-1.07-1.08 1.07c-1.3 1.3-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07c-.41.41-.91.63-1.44.65V21c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-4.01z"/>`,
  "Soft Drinks": `<path d="M3 2l2.01 18.23C5.13 21.23 5.97 22 7 22h10c1.03 0 1.87-.77 1.99-1.77L21 2H3zm9 17c-1.66 0-3-1.34-3-3 0-2 3-5.4 3-5.4s3 3.4 3 5.4c0 1.66-1.34 3-3 3zm6.33-11H5.67l-.44-4h13.53l-.43 4z"/>`,
  "Alcoholic Drinks": `<path d="M21 5V3H3v2l8 9v5H6v2h12v-2h-5v-5l8-9zM7.43 7L5.66 5h12.69l-1.78 2H7.43z"/>`
};
const iconFor = (cat) => CATEGORY_ICON[cat] || CATEGORY_ICON["All Items"];

function renderCategories() {
  const check = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>`;
  $("#categoryList").innerHTML = tabs()
    .map((tab) => {
      const active = tab === state.activeTab;
      return `<button class="categoryButton ${active ? "active" : ""}" type="button" data-tab="${esc(tab)}">
        <span class="catIcon"><svg viewBox="0 0 24 24" aria-hidden="true">${iconFor(tab)}</svg></span>
        <span class="catName">${esc(tab)}</span>
        ${active ? `<span class="catCheck">${check}</span>` : ""}
      </button>`;
    })
    .join("");
  $("#activeCategoryTitle").textContent = state.activeTab;
}

function stepperMarkup(id, qty, mini) {
  const safeId = esc(id);
  if (qty <= 0) return `<button class="addBtn" type="button" data-inc="${safeId}">Add</button>`;
  return `<div class="stepper ${mini ? "mini" : ""}" aria-label="quantity">
      <button type="button" data-dec="${safeId}" aria-label="decrease">−</button>
      <span>${qty}</span>
      <button type="button" data-inc="${safeId}" aria-label="increase">+</button>
    </div>`;
}

// Recommended landing = a curated bento of featured dishes (no search).
function featuredItems() {
  const flagged = state.menu.items.filter((item) => item.featured);
  return flagged.length ? flagged : state.menu.items.filter((item) => item.category === "Recommended");
}

// A single neutral placeholder shown for any menu item without a photo. Real photos
// arrive via admin management (set `image` on the item) once shops upload them.
const PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 320'>" +
  "<rect width='320' height='320' fill='#eef0f2'/>" +
  "<g transform='translate(100 100) scale(5)' fill='#b9bfc8'>" +
  "<path d='M8.1 13.34l2.83-2.83L3.91 3.5a4 4 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z'/>" +
  "</g></svg>"
)}`;

const EMPTY_ICON = {
  menu: `<path d="M8.1 13.34l2.83-2.83L3.91 3.5a4 4 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"/>`,
  bucket: `<path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 3h2l2.2 10.4A3 3 0 0 0 10.1 16H18v-2h-7.9a1 1 0 0 1-1-.8L8.8 12H18l3-7H7.3L6.7 3H3v2Z"/>`,
  history: `<path d="M12 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-2.1-5H14v2h6V3h-2v2.1A9 9 0 0 0 12 3Zm-1 4v6l5 3 .9-1.6-3.9-2.3V7h-2Z"/>`,
  checkout: `<path d="M5 4h14v16l-2.5-1.5L14 20l-2-1.5L10 20l-2.5-1.5L5 20V4Zm4 4v2h6V8H9Zm0 4v2h6v-2H9Z"/>`
};

function emptyState(icon, message) {
  return `<div class="emptyState"><div class="emptyIcon"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></div><p>${message}</p></div>`;
}

function photoMarkup(item) {
  const src = safeImageUrl(item.image) || PLACEHOLDER_IMAGE;
  return `<img class="photoImg" src="${esc(src)}" alt="" loading="lazy" />`;
}

function listCard(item) {
  const price = item.price === 0 ? `<span class="price free">Free</span>` : `<span class="price">${money.format(item.price)}</span>`;
  return `<article class="menuItem">
      <div class="menuPhoto">${photoMarkup(item)}</div>
      <div class="menuText"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p>${price}</div>
      <div class="menuAdd">${stepperMarkup(item.id, quantityFor(item.id), false)}</div>
    </article>`;
}

function bentoTile(item, i) {
  const t = tintFor(item.category);
  const wide = i % 3 === 0;
  const hero = i === 0;
  const price = item.price === 0 ? "Free" : money.format(item.price);
  const img = safeImageUrl(item.image);
  const media = img
    ? `<img class="bentoImg" src="${esc(img)}" alt="" loading="lazy" />`
    : `<span class="glyph" aria-hidden="true">${esc(monogram(item.name))}</span>`;
  return `<article class="bentoTile ${wide ? "wide" : ""} ${hero ? "hero" : ""} ${img ? "has-photo" : ""}" style="--tint-bg:${t.bg};--tint-fg:${t.fg}">
      ${media}
      <div class="bentoTop">
        ${item.tags.includes("popular") ? `<span class="tag">Popular</span>` : ""}
        <h3>${esc(item.name)}</h3>
        ${hero ? `<p>${esc(item.description)}</p>` : ""}
      </div>
      <div class="bentoFoot">
        <span class="price">${price}</span>
        ${stepperMarkup(item.id, quantityFor(item.id), true)}
      </div>
    </article>`;
}

function renderMenu() {
  renderCategories();
  const isHome = state.activeTab === "Recommended";
  $("#searchBox").hidden = isHome;
  const list = $("#menuList");

  if (isHome) {
    list.className = "bento";
    list.innerHTML = featuredItems().map((item, i) => bentoTile(item, i)).join("");
    return;
  }

  list.className = "menuList";
  const items = filteredItems();
  list.innerHTML = items.length
    ? items.map((item) => listCard(item)).join("")
    : emptyState(EMPTY_ICON.menu, "No items found.");
}

function cartLines() {
  return [...state.cart.entries()].map(([id, quantity]) => {
    const item = state.menu.items.find((m) => m.id === id);
    return { ...item, quantity };
  });
}
function currentCartTotal() { return cartLines().reduce((s, i) => s + i.price * i.quantity, 0); }

function renderBucket() {
  const lines = cartLines();
  const count = lines.reduce((s, i) => s + i.quantity, 0);
  $("#bucketCount").textContent = count;
  const badge = $("#navBadge");
  badge.textContent = count;
  badge.hidden = count === 0;

  $("#cartItems").innerHTML = lines.length
    ? lines.map((item) => `<div class="cartLine">
        <div>
          <h3>${esc(item.name)}</h3>
          <div class="unit">${item.price === 0 ? "Free" : money.format(item.price) + " each"}${isDessert(item) ? ` <span class="lineTag${state.dessertTiming.get(item.id) === "later" ? " later" : ""}">${state.dessertTiming.get(item.id) === "later" ? "After meal" : "Serve now"}</span>` : ""}</div>
        </div>
        <div class="right">
          ${stepperMarkup(item.id, item.quantity, true)}
          <span class="lineTotal">${money.format(item.price * item.quantity)}</span>
        </div>
      </div>`).join("")
    : emptyState(EMPTY_ICON.bucket, "Nothing here yet — add dishes from the Menu.");

  $("#bucketFoot").hidden = lines.length === 0;
  $("#cartTotal").textContent = money.format(currentCartTotal());
  $("#placeOrderButton").disabled = lines.length === 0;
}

function renderHistory() {
  const orders = state.session && state.session.orders ? state.session.orders : [];
  $("#historyList").innerHTML = orders.length
    ? orders.map((order) => {
        const count = order.items.reduce((s, i) => s + i.quantity, 0);
        return `<article class="orderCard">
          <header><strong>Slip ${esc(order.id)}</strong><span class="statusChip">${esc(order.status || "Sent")}</span></header>
          <ul>${order.items.map((i) => `<li>${i.quantity} × ${esc(i.name)}</li>`).join("")}</ul>
          <footer><span>${count} item${count === 1 ? "" : "s"}</span><strong>${money.format(order.totals.total)}</strong></footer>
        </article>`;
      }).join("")
    : emptyState(EMPTY_ICON.history, "No orders yet.");
}

function renderTotals(totals) {
  $("#totals").innerHTML = `
    <div class="totalLine"><span>Subtotal</span><strong>${money.format(totals.subtotal)}</strong></div>
    <div class="totalLine"><span>Service fee</span><strong>${money.format(totals.serviceFee)}</strong></div>
    <div class="totalLine"><span>Tax</span><strong>${money.format(totals.tax)}</strong></div>
    <div class="totalLine grand"><span>Total</span><strong>${money.format(totals.total)}</strong></div>`;
}

function renderBarcode(value) {
  const text = String(value || `TABLE-${state.tableNumber}`);
  const bars = [...text].flatMap((char) => {
    const code = char.charCodeAt(0);
    return [`<span class="barcodeBar ${code % 2 ? "thin" : "wide"}"></span>`, `<span class="barcodeBar"></span>`];
  }).join("");
  $("#checkoutBarcode").innerHTML = `<div class="barcodeBars">${bars}</div><span class="barcodeText">${esc(text)}</span>`;
}

function renderSession() {
  const s = state.session;
  $("#tableTag").textContent = `T-${String(state.tableNumber).padStart(3, "0")}`;
  renderTotals(s ? s.totals : { subtotal: 0, serviceFee: 0, tax: 0, total: 0 });
  renderHistory();
  renderBarcode(s && s.slipNumber);
  // "Bring my dessert" only makes sense once a dessert has actually been ordered.
  const orders = s && s.orders ? s.orders : [];
  const hasDessert = orders.some((o) => Array.isArray(o.items) && o.items.some((i) => i.category === "Desserts"));
  $("#serveDessertButton").hidden = !hasDessert;
  // Nothing ordered yet -> nothing to check out.
  const hasOrders = orders.length > 0;
  $("#billCard").hidden = !hasOrders;
  $("#checkoutEmpty").hidden = hasOrders;
  if (!hasOrders) $("#checkoutEmpty").innerHTML = emptyState(EMPTY_ICON.checkout, "No orders yet — place an order to check out.");
}

async function placeOrder() {
  const items = cartLines().map((item) => ({ id: item.id, quantity: item.quantity }));
  if (!items.length) return;
  const result = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ items })
  });
  state.session = result.session;
  state.cart.clear();
  state.dessertTiming.clear();
  renderSession();
  renderBucket();
  renderMenu();
  setActiveView("history");
  showToast(`Order sent. Slip ${result.session.slipNumber}`);
}

async function callStaff(reason, message) {
  await api("/api/staff-calls", {
    method: "POST",
    body: JSON.stringify({ reason })
  });
  showToast(message);
}

/* ---------------- Events ---------------- */
document.addEventListener("click", (event) => {
  const inc = event.target.closest("[data-inc]");
  const dec = event.target.closest("[data-dec]");
  const tab = event.target.closest("[data-tab]");
  const view = event.target.closest("[data-view]");
  const timing = event.target.closest("[data-timing]");

  if (inc) requestAdd(inc.dataset.inc);
  if (dec) setQuantity(dec.dataset.dec, quantityFor(dec.dataset.dec) - 1);
  if (tab) { state.activeTab = tab.dataset.tab; setActiveView("menu"); closeDrawer(); renderMenu(); }
  if (view) { setActiveView(view.dataset.view); if (event.target.closest("[data-close]")) closeDrawer(); }
  if (timing) {
    const id = state.pending;
    closeDessertSheet();
    if (id) { state.dessertTiming.set(id, timing.dataset.timing); setQuantity(id, quantityFor(id) + 1); }
  }
});

$("#openDrawer").addEventListener("click", openDrawer);
$("#closeDrawer").addEventListener("click", closeDrawer);
$("#drawerBackdrop").addEventListener("click", closeDrawer);
$("#howToOrder").addEventListener("click", () => { closeDrawer(); showToast("Pick a category, tap Add, then Place order."); });
$("#searchInput").addEventListener("input", renderMenu);
$("#placeOrderButton").addEventListener("click", () => placeOrder().catch((error) => toastUnlessBlocked(error.message)));
$("#callStaffButton").addEventListener("click", () => callStaff("Customer requested staff", "Staff call sent.").catch((error) => toastUnlessBlocked(error.message)));
$("#serveDessertButton").addEventListener("click", () => callStaff("Please bring my dessert", "We'll bring your dessert shortly.").catch((error) => toastUnlessBlocked(error.message)));
$("#ageYes").addEventListener("click", () => { state.ageVerified = true; const id = state.pending; closeAgeGate(); if (id) requestAdd(id); });
$("#ageNo").addEventListener("click", () => { closeAgeGate(); showToast("Alcohol can only be ordered by guests 21 or older."); });
$("#dessertBackdrop").addEventListener("click", closeDessertSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDrawer(); closeDessertSheet(); } });

const appBar = $("#appBar");
window.addEventListener("scroll", () => appBar.classList.toggle("scrolled", window.scrollY > 4), { passive: true });

// DEMO ONLY: dishes have no real photos yet, so fetch stand-in food photos at
// runtime from free food-photo APIs (TheMealDB for food, TheCocktailDB for drinks)
// by dish name. Best-effort; unmatched items keep the placeholder. Replace this
// with real per-item photos from admin management.
const DRINK_CATEGORIES = ["Soft Drinks", "Alcoholic Drinks"];
async function fetchFoodImage(item) {
  const base = DRINK_CATEGORIES.includes(item.category)
    ? "https://www.thecocktaildb.com/api/json/v1/1/search.php?s="
    : "https://www.themealdb.com/api/json/v1/1/search.php?s=";
  const words = String(item.name).trim().split(/\s+/);
  for (const term of [item.name, words[words.length - 1]]) {
    try {
      const res = await fetch(base + encodeURIComponent(term));
      if (!res.ok) continue;
      const data = await res.json();
      const rec = (data.meals || data.drinks || [])[0];
      const url = rec && (rec.strMealThumb || rec.strDrinkThumb);
      if (url) return url;
    } catch { /* ignore network errors */ }
  }
  return "";
}
async function enrichImages() {
  const targets = state.menu.items.filter((it) => !it.image && it.category !== "Service & Utensils");
  await Promise.all(targets.map(async (it) => {
    const url = safeImageUrl(await fetchFoodImage(it));
    if (url) it.image = url;
  }));
  renderMenu();
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
  enrichImages().catch(() => {});
}

const params = new URLSearchParams(window.location.search);
if (params.get("e") === "expired") {
  showBlockScreen("invalid");
} else {
  init().catch((error) => toastUnlessBlocked(error.message));
}
