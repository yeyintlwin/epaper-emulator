const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("pixel designer starts hidden and has a toggle button", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

  assert.match(html, /id="designerToggle"/);
  assert.match(html, /id="designerPanel"/);
  assert.match(html, /class="panel hidden"/);
});

test("pixel designer toggle behavior is wired in app script", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(js, /designerToggle/);
  assert.match(js, /designerPanel\.classList\.toggle\("hidden"\)/);
});

test("pixel designer toggle does not crash stale browser tabs", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(js, /if \(designerToggle && designerPanel\)/);
  assert.doesNotMatch(js, /^designerToggle\.addEventListener/m);
});

test("epaper grid stays centered while designer floats", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");

  assert.match(css, /\.layout\s*{[^}]*grid-template-columns:\s*minmax\(296px,\s*1184px\)/s);
  assert.match(css, /\.layout\s*{[^}]*justify-content:\s*center/s);
  assert.match(css, /\.panel\s*{[^}]*position:\s*fixed/s);
  assert.doesNotMatch(css, /\.layout\s*{[^}]*340px/s);
});

test("static assets disable browser cache during emulator changes", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  assert.match(server, /Cache-Control", "no-store"/);
});

test("browser keeps realtime updates alive and renders POST responses immediately", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.match(js, /let eventSource/);
  assert.match(js, /eventSource = new EventSource/);
  assert.match(js, /if \(payload\.screen\) renderScreen\(payload\.screen\)/);
});

test("server keeps SSE connections unbuffered and alive", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

  assert.match(server, /"X-Accel-Buffering": "no"/);
  assert.match(server, /setInterval/);
  assert.match(server, /: heartbeat/);
});
