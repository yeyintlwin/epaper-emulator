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

test("frontend config endpoint does not expose e-paper or display secrets", async () => {
  const server = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: { updateTableInUse: async () => ({ ok: true }) }
  });

  const response = await server.inject("GET", "/api/config");

  assert.equal(response.status, 200);
  assert.equal(response.body.epaperApiKey, undefined);
  assert.equal(response.body.tableDisplayApiKey, undefined);
  assert.equal(response.body.apiKey, undefined);
  assert.equal(response.body.maxTableNumber, 12);
});

test("server can reuse epaper hub API_KEY when EPAPER_API_KEY is not set", () => {
  const source = require("node:fs").readFileSync(require.resolve("../server"), "utf8");

  assert.match(source, /process\.env\.EPAPER_API_KEY \|\| process\.env\.API_KEY/);
});

test("provisioning compares SHA-256 token digests with timingSafeEqual", () => {
  const source = require("node:fs").readFileSync(require.resolve("../server"), "utf8");

  assert.match(source, /const supplied = crypto\.createHash\("sha256"\)\.update\(.+\)\.digest\(\)/);
  assert.match(source, /const configured = crypto\.createHash\("sha256"\)\.update\(.+\)\.digest\(\)/);
  assert.match(source, /crypto\.timingSafeEqual\(supplied, configured\)/);
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

test("provisioning rejects an incorrect bearer token with the configured token length", async () => {
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
    "/api/table-displays/7/welcome",
    undefined,
    { authorization: "Bearer display-secrEt" }
  );

  assert.equal(response.status, 401);
  assert.equal(updates, 0);
});

test("provisioning rejects noncanonical table number segments", async () => {
  let updates = 0;
  const server = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: displayClient(async () => {
      updates += 1;
      return { ok: true };
    })
  });

  for (const tableNumber of ["-1", "1.5", "not-a-number", "1e0", "0x1", "01", "0", "13"]) {
    const response = await server.inject(
      "POST",
      `/api/table-displays/${tableNumber}/welcome`,
      undefined,
      { authorization: "Bearer display-secret" }
    );

    assert.equal(response.status, 400);
  }
  assert.equal(updates, 0);
});

test("provisioning rejects active tables without updating the display or session", async () => {
  let welcomeUpdates = 0;
  const server = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: {
      updateTableInUse: async () => ({ ok: true }),
      updateTableWelcome: async () => {
        welcomeUpdates += 1;
        return { ok: true };
      }
    }
  });

  const order = await server.inject("POST", "/api/orders", {
    table_number: 7,
    items: [{ id: "crispy-gyoza", quantity: 1 }]
  });
  const before = await server.inject("GET", "/api/session?table_number=7");
  const response = await server.inject(
    "POST",
    "/api/table-displays/7/welcome",
    undefined,
    { authorization: "Bearer display-secret" }
  );
  const after = await server.inject("GET", "/api/session?table_number=7");

  assert.equal(order.status, 201);
  assert.equal(before.body.session.status, "Table is in use");
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { error: "Table is in use" });
  assert.equal(welcomeUpdates, 0);
  assert.deepEqual(after.body.session, before.body.session);
});

test("a concurrent first order leaves the table display in use after Welcome provisioning", async () => {
  let releaseWelcome;
  const welcomeStarted = new Promise((resolve) => {
    releaseWelcome = resolve;
  });
  let beginWelcome;
  const welcomeBegun = new Promise((resolve) => {
    beginWelcome = resolve;
  });
  const displayUpdates = [];
  const server = createServer({
    tableDisplayApiKey: "display-secret",
    epaperClient: {
      updateTableWelcome: async () => {
        beginWelcome();
        await welcomeStarted;
        displayUpdates.push("Welcome");
        return { ok: true };
      },
      updateTableInUse: async () => {
        displayUpdates.push("Table is in use");
        return { ok: true };
      }
    }
  });

  const welcome = server.inject(
    "POST",
    "/api/table-displays/7/welcome",
    undefined,
    { authorization: "Bearer display-secret" }
  );
  await welcomeBegun;
  const order = server.inject("POST", "/api/orders", {
    table_number: 7,
    items: [{ id: "crispy-gyoza", quantity: 1 }]
  });
  await new Promise(setImmediate);
  releaseWelcome();

  const [welcomeResponse, orderResponse] = await Promise.all([welcome, order]);
  const sessionResponse = await server.inject("GET", "/api/session?table_number=7");

  assert.equal(welcomeResponse.status, 200);
  assert.equal(orderResponse.status, 201);
  assert.equal(sessionResponse.body.session.status, "Table is in use");
  assert.deepEqual(displayUpdates, ["Welcome", "Table is in use"]);
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

  const before = await server.inject("GET", "/api/session?table_number=7");
  const response = await server.inject(
    "POST",
    "/api/table-displays/7/welcome",
    undefined,
    { authorization: "Bearer display-secret" }
  );
  const after = await server.inject("GET", "/api/session?table_number=7");

  assert.equal(before.body.session.status, "Welcome");
  assert.equal(before.body.session.orders.length, 0);
  assert.equal(response.status, 502);
  assert.deepEqual(response.body, { error: "E-paper display update failed" });
  assert.deepEqual(after.body.session, before.body.session);
});
