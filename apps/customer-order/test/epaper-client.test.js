const assert = require("node:assert/strict");
const test = require("node:test");
const { renderTableDisplay } = require("../../../packages/epaper-hub-sdk");
const { createEpaperClient } = require("../epaper-client");

test("declares the e-paper SDK as a customer server dependency", () => {
  const packageJson = require("../package.json");
  assert.equal(packageJson.dependencies["@restaurant/epaper-hub-sdk"], "file:../../packages/epaper-hub-sdk");
});

test("updates e-paper status through server-side authenticated request", async () => {
  const requests = [];
  const client = createEpaperClient({
    hubUrl: "https://epaper-hub.example.test/",
    apiKey: "secret-key",
    orderBaseUrl: "https://order.example.test/food",
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
  assert.deepEqual(
    JSON.parse(requests[0].options.body),
    renderTableDisplay({
      tableNumber: 7,
      status: "Table is in use",
      url: "https://order.example.test/food?table=7"
    })
  );
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
