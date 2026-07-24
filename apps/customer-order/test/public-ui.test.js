const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.join(__dirname, "..", "public");

test("customer UI: app-bar shell, category drawer, bottom nav, serving/age gates, and secure session handling", () => {
  const html = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(publicRoot, "styles.css"), "utf8");
  const js = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");

  // Shell + app bar (shop name + table tag, hamburger opens the category drawer)
  assert.match(html, /viewport/);
  assert.match(html, /id="appBar"/);
  assert.match(html, /id="shopName"/);
  assert.match(html, /id="tableTag"/);
  assert.match(html, /id="openDrawer"/);

  // Bottom nav with five destinations
  assert.match(html, /id="bottomNav"/);
  assert.match(html, /data-view="menu"/);
  assert.match(html, /data-view="bucket"/);
  assert.match(html, /data-view="history"/);
  assert.match(html, /data-view="staff"/);
  assert.match(html, /data-view="checkout"/);
  assert.match(html, /id="bucketView"/);
  assert.match(html, /id="historyView"/);

  // Category drawer
  assert.match(html, /id="categoryDrawer"/);
  assert.match(html, /id="drawerBackdrop"/);
  assert.match(html, /id="categoryList"/);

  // Staff actions + checkout barcode. Split-bill lives in the counter app, not here.
  assert.match(html, /id="callStaffButton"/);
  assert.match(html, /id="serveDessertButton"/);
  assert.match(html, /id="checkoutBarcode"/);
  assert.doesNotMatch(html, /id="billSplit"|Split the bill/);

  // Dessert serving-time sheet + alcohol 21+ age gate
  assert.match(html, /id="dessertSheet"/);
  assert.match(html, /Serve after my meal/);
  assert.match(html, /id="ageGate"/);
  assert.match(html, /Are you 21 or older/);

  assert.doesNotMatch(html, /id="paymentQr"|id="menuTabs"|id="cartSheet"/);

  // Layout / styling invariants
  assert.match(css, /max-width:\s*480px/);
  assert.match(css, /\.bottomNav/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*1fr\)/);
  assert.match(css, /\.drawer/);
  assert.match(css, /transform:\s*translateX\(-110%\)/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /\.checkoutBarcode/);

  // Behaviour anchors
  assert.match(js, /Recommended/);
  assert.match(js, /Service & Utensils/);
  assert.match(js, /Alcoholic Drinks/);
  assert.match(js, /setActiveView/);
  assert.match(js, /openDrawer/);
  assert.match(js, /renderHistory/);
  assert.match(js, /renderBarcode/);

  // Dead-QR block screen / session security
  assert.match(html, /id="blockScreen"/);
  assert.match(js, /params\.get\("e"\) === "expired"/);
  assert.match(js, /api\("\/api\/session"\)/);
  assert.match(js, /sessionResult\.session\.tableNumber/);
  assert.match(js, /showBlockScreen\(state\.session \? "invalid" : "missing"\)/);
  assert.match(js, /classList\.add\("blocked"\)/);
  assert.match(js, /response\.status === 401 \|\| response\.status === 410/);
  assert.doesNotMatch(js, /getTableNumber|table_number|api\(`\/api\/session\?/);
  assert.doesNotMatch(`${html}\n${css}\n${js}`, /EPAPER_API_KEY|TABLE_DISPLAY_API_KEY|CHECKOUT_API_KEY|API_KEY|Bearer/);
});
