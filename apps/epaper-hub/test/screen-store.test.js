const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createScreenStore } = require("../screen-store");

test("screen store persists and reloads latest screen state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epaper-store-"));
  const store = createScreenStore(path.join(dir, "screens.json"));
  const screens = new Map([
    [
      "1",
      {
        id: 1,
        updatedAt: "2026-07-19T00:00:00.000Z",
        data: { title: "Latest", frame: { format: "epd-2bit-v1", width: 296, height: 128, data: "abc" } }
      }
    ]
  ]);

  store.save(screens);

  assert.deepEqual(store.load(), Array.from(screens.values()));
});

test("screen store treats missing file as empty state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epaper-store-"));
  const store = createScreenStore(path.join(dir, "missing.json"));

  assert.deepEqual(store.load(), []);
});
