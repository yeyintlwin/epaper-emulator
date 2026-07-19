const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.join(__dirname, "..", "public");

test("mobile customer UI uses native-style bottom navigation and a menu category drawer", () => {
  const html = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(publicRoot, "styles.css"), "utf8");
  const js = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");

  assert.match(html, /viewport/);
  assert.match(html, /id="bottomNav"/);
  assert.match(html, /data-view="menu"/);
  assert.match(html, /data-view="bucket"/);
  assert.match(html, /data-view="history"/);
  assert.match(html, /data-view="staff"/);
  assert.match(html, /data-view="checkout"/);
  assert.match(html, /Order Bucket/);
  assert.match(html, /Order History/);
  assert.match(html, /id="categoryDrawer"/);
  assert.match(html, /id="drawerBackdrop"/);
  assert.match(html, /id="categoryList"/);
  assert.match(html, /id="bucketView"/);
  assert.match(html, /id="historyView"/);
  assert.match(html, /id="callStaffButton"/);
  assert.match(html, /id="billSplit"/);
  assert.match(html, /id="checkoutBarcode"/);
  assert.doesNotMatch(html, /id="paymentQr"|id="menuTabs"|id="cartSheet"/);
  assert.match(css, /max-width:\s*820px/);
  assert.match(css, /\.bottomNav/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*1fr\)/);
  assert.match(css, /\.categoryDrawer/);
  assert.match(css, /transform:\s*translateX\(-110%\)/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /\.checkoutBarcode/);
  assert.match(js, /Recommended/);
  assert.match(js, /Service & Utensils/);
  assert.match(js, /Alcoholic Drinks/);
  assert.match(js, /setActiveView/);
  assert.match(js, /openDrawer/);
  assert.match(js, /renderHistory/);
  assert.match(js, /renderBarcode/);
  assert.doesNotMatch(js, /EPAPER_API_KEY|TABLE_DISPLAY_API_KEY|API_KEY|Bearer/);
});
