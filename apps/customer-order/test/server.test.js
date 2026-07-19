const assert = require("node:assert/strict");
const test = require("node:test");
const { createServer } = require("../server");

function displayClient(updateTableWelcome) {
  return {
    updateTableWelcome,
    updateTableInUse: async () => ({ ok: true })
  };
}

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

test("authorized provisioning displays the Welcome ordering QR", async () => {
  const updates = [];
  const server = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: displayClient(async (tableNumber) => {
      updates.push(tableNumber);
      return { ok: true };
    })
  });

  const response = await server.inject(
    "POST",
    "/api/table-displays/7/welcome",
    undefined,
    { authorization: "Bearer display-secret" }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true, tableNumber: 7, status: "Welcome" });
  assert.deepEqual(updates, [7]);
});

test("provisioning rejects missing or incorrect authorization", async () => {
  let updates = 0;
  const server = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: displayClient(async () => {
      updates += 1;
      return { ok: true };
    })
  });

  const missing = await server.inject("POST", "/api/table-displays/7/welcome");
  const incorrect = await server.inject(
    "POST",
    "/api/table-displays/7/welcome",
    undefined,
    { authorization: "Bearer wrong-secret" }
  );

  assert.equal(missing.status, 401);
  assert.equal(incorrect.status, 401);
  assert.equal(updates, 0);
});

test("provisioning rejects table numbers outside 1 through 12", async () => {
  let updates = 0;
  const server = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: displayClient(async () => {
      updates += 1;
      return { ok: true };
    })
  });

  const response = await server.inject(
    "POST",
    "/api/table-displays/13/welcome",
    undefined,
    { authorization: "Bearer display-secret" }
  );

  assert.equal(response.status, 400);
  assert.equal(updates, 0);
});

test("provisioning reports missing server display configuration", async () => {
  const missingKeyServer = createServer({
    tableDisplayApiKey: "",
    epaperClient: displayClient(async () => ({ ok: true }))
  });
  const missingHubServer = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: displayClient(async () => ({ skipped: true }))
  });

  const missingKey = await missingKeyServer.inject("POST", "/api/table-displays/7/welcome");
  const missingHub = await missingHubServer.inject(
    "POST",
    "/api/table-displays/7/welcome",
    undefined,
    { authorization: "Bearer display-secret" }
  );

  assert.equal(missingKey.status, 503);
  assert.equal(missingHub.status, 503);
});

test("provisioning maps SDK failures to 502 without changing the session", async () => {
  const server = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: displayClient(async () => {
      throw new Error("Bearer secret must not leak");
    })
  });

  const response = await server.inject(
    "POST",
    "/api/table-displays/7/welcome",
    undefined,
    { authorization: "Bearer display-secret" }
  );
  const session = await server.inject("GET", "/api/session?table_number=7");

  assert.equal(response.status, 502);
  assert.deepEqual(response.body, { error: "E-paper display update failed" });
  assert.equal(session.body.session.status, "Welcome");
  assert.deepEqual(session.body.session.orders, []);
});
