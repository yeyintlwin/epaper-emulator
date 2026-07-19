const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("shows the project name as the main page title", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

  assert.match(html, /<title>E-paper Emulator<\/title>/);
  assert.match(html, /<h1>E-paper Emulator<\/h1>/);
});
