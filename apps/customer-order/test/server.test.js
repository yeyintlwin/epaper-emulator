const assert = require("node:assert/strict");
const test = require("node:test");
const { createServer } = require("../server");

test("placing first order updates e-paper once and keeps slip for later orders", async () => {
  const epaperUpdates = [];
  const server = createServer({
    now: () => new Date("2026-07-19T10:00:00Z"),
    epaperClient: {
      updateTableInUse: async (tableNumber, session) => {
        epaperUpdates.push({ tableNumber, slipNumber: session.slipNumber });
        return { ok: true };
      }
    }
  });

  const first = await server.inject("POST", "/api/orders", {
    table_number: 4,
    items: [{ id: "crispy-gyoza", quantity: 1 }]
  });
  const second = await server.inject("POST", "/api/orders", {
    table_number: 4,
    items: [{ id: "green-tea-ice-cream", quantity: 1 }]
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.session.slipNumber, second.body.session.slipNumber);
  assert.deepEqual(epaperUpdates, [{ tableNumber: 4, slipNumber: first.body.session.slipNumber }]);
});

test("keeps a stored order successful and retries a failed e-paper update", async () => {
  let attempts = 0;
  const server = createServer({
    epaperClient: {
      updateTableInUse: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("hub unavailable");
        return { ok: true };
      }
    }
  });
  const body = {
    table_number: 4,
    items: [{ id: "crispy-gyoza", quantity: 1 }]
  };

  const first = await server.inject("POST", "/api/orders", body);
  const second = await server.inject("POST", "/api/orders", body);

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(attempts, 2);
});

test("frontend config endpoint does not expose e-paper secrets", async () => {
  const server = createServer({
    epaperClient: { updateTableInUse: async () => ({ ok: true }) }
  });

  const response = await server.inject("GET", "/api/config");

  assert.equal(response.status, 200);
  assert.equal(response.body.epaperApiKey, undefined);
  assert.equal(response.body.maxTableNumber, 12);
});

test("server can reuse epaper hub API_KEY when EPAPER_API_KEY is not set", () => {
  const source = require("node:fs").readFileSync(require.resolve("../server"), "utf8");

  assert.match(source, /process\.env\.EPAPER_API_KEY \|\| process\.env\.API_KEY/);
});
