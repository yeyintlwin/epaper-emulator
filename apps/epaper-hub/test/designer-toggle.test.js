const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("pixel designer UI is removed from the page", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

  assert.doesNotMatch(html, /designerToggle|designerPanel|Pixel Designer|pixelCanvas|apiResult/);
});

test("browser script has no pixel designer event handlers", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.doesNotMatch(js, /designerToggle|designerPanel|sendButton|pixelCanvas|redrawEditor|drawAt/);
});

test("epaper grid stays centered without a designer panel", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

  assert.match(css, /\.layout\s*{[^}]*grid-template-columns:\s*minmax\(296px,\s*1184px\)/s);
  assert.match(css, /\.layout\s*{[^}]*justify-content:\s*center/s);
  assert.doesNotMatch(css, /\.panel|\.editor|#pixelCanvas|\.swatch|\.toggleButton/);
});

test("static assets disable browser cache during emulator changes", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  assert.match(server, /Cache-Control", "no-store"/);
});

test("browser keeps realtime updates alive for the viewer", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(js, /let eventSource/);
  assert.match(js, /eventSource = new EventSource/);
  assert.match(js, /payload\.screens\.forEach\(renderScreen\)/);
  assert.match(js, /renderScreen\(payload\)/);
});

test("server keeps SSE connections unbuffered and alive", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  assert.match(server, /"X-Accel-Buffering": "no"/);
  assert.match(server, /setInterval/);
  assert.match(server, /: heartbeat/);
});

test("server exposes a standalone API documentation endpoint", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  assert.match(server, /app\.get\("\/api\/docs"/);
  assert.match(server, /epd-2bit-v1/);
  assert.match(server, /POST \/api\/epapers\/:id/);
});
