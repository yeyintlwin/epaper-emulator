const assert = require("node:assert/strict");
const test = require("node:test");
const { createEpaperClient } = require("../epaper-client");

test("updates e-paper status through server-side authenticated request", async () => {
  const requests = [];
  const client = createEpaperClient({
    hubUrl: "https://epaper-hub.example.test/",
    apiKey: "secret-key",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });

  await client.updateTableInUse(7, { slipNumber: "SLIP-20260719-007" });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://epaper-hub.example.test/api/epapers/7");
  assert.equal(requests[0].options.headers.Authorization, "Bearer secret-key");
  assert.equal(requests[0].options.headers["Content-Type"], "application/json");
  assert.match(requests[0].options.body, /Table is in use/);
  assert.match(requests[0].options.body, /SLIP-20260719-007/);
});

test("skips e-paper update when hub url or api key is missing", async () => {
  const client = createEpaperClient({
    hubUrl: "",
    apiKey: "",
    fetchImpl: async () => {
      throw new Error("fetch should not run");
    }
  });

  const result = await client.updateTableInUse(1, { slipNumber: "SLIP-1" });

  assert.deepEqual(result, { skipped: true });
});
