const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const publicRoot = path.join(__dirname, "..", "public");

test("mobile customer UI contains ordering, staff call, checkout, split, and payment surfaces", () => {
  const html = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(publicRoot, "styles.css"), "utf8");
  const js = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");

  assert.match(html, /viewport/);
  assert.match(html, /id="menuTabs"/);
  assert.match(html, /id="cartSheet"/);
  assert.match(html, /id="callStaffButton"/);
  assert.match(html, /id="billSplit"/);
  assert.match(html, /id="paymentQr"/);
  assert.match(css, /max-width:\s*820px/);
  assert.match(css, /position:\s*sticky/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(js, /Recommended/);
  assert.match(js, /Service & Utensils/);
  assert.match(js, /Alcoholic Drinks/);
  assert.doesNotMatch(js, /EPAPER_API_KEY|API_KEY|Bearer/);
});
