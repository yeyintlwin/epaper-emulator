const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createTableVisitStore } = require("../table-visit-store");
const { createServer: createCustomerServer, initializeTableDisplays: initializeCustomerTableDisplays, start } = require("../server");

function createVisitStore() {
  const visitStore = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com"
  });
  visitStore.createInitialVisits();
  return visitStore;
}

function createServer(options = {}) {
  return createCustomerServer({ visitStore: createVisitStore(), ...options });
}

function initializeTableDisplays(options = {}) {
  return initializeCustomerTableDisplays({ visitStore: createVisitStore(), ...options });
}

test("createServer requires an explicit visit store", () => {
  assert.throws(() => createCustomerServer(), /visitStore is required/);
});

function displayClient(updateTableWelcome) {
  return {
    updateTableWelcome,
    updateTableInUse: async () => ({ ok: true })
  };
}

test("startup renders twelve unique opaque Welcome URLs before listening", async () => {
  const updates = [];
  let listened = false;
  const pending = [];
  const epaperClient = {
    updateTableWelcome(tableNumber, orderingUrl) {
      updates.push({ tableNumber, orderingUrl });
      return new Promise((resolve) => pending.push(resolve));
    }
  };

  const starting = start({
    epaperClient,
    port: 0,
    listen: () => { listened = true; }
  });
  await new Promise(setImmediate);

  assert.deepEqual(updates.map(({ tableNumber }) => tableNumber), Array.from({ length: 12 }, (_, index) => index + 1));
  assert.equal(new Set(updates.map(({ orderingUrl }) => orderingUrl)).size, 12);
  assert.ok(updates.every(({ orderingUrl }) => /^https:\/\/order\.yeyintlwin\.com\/t\/[A-Za-z0-9_-]{22}$/.test(orderingUrl)));
  assert.equal(listened, false);
  pending.forEach((resolve) => resolve({ ok: true }));
  await starting;
  assert.equal(listened, true);
});

test("startup retries a transient 503 display failure", async () => {
  const attempts = new Map();
  const urls = [];
  let sleeps = 0;
  await initializeTableDisplays({
    epaperClient: {
      async updateTableWelcome(tableNumber, orderingUrl) {
        const count = (attempts.get(tableNumber) || 0) + 1;
        attempts.set(tableNumber, count);
        if (tableNumber === 7) urls.push(orderingUrl);
        if (tableNumber === 7 && count === 1) throw new Error("E-paper hub update failed with 503");
        return { ok: true };
      }
    },
    attempts: 2,
    sleep: async () => { sleeps += 1; }
  });

  assert.equal(attempts.get(7), 2);
  assert.equal([...attempts.values()].reduce((sum, count) => sum + count, 0), 13);
  assert.equal(sleeps, 1);
  assert.equal(urls.length, 2);
  assert.equal(urls[0], urls[1]);
});

test("startup does not retry a permanent 401 display failure", async () => {
  const attempts = new Map();
  let sleeps = 0;

  await assert.rejects(() => initializeTableDisplays({
    epaperClient: {
      async updateTableWelcome(tableNumber) {
        attempts.set(tableNumber, (attempts.get(tableNumber) || 0) + 1);
        if (tableNumber === 7) throw new Error("E-paper hub update failed with 401");
        return { ok: true };
      }
    },
    attempts: 3,
    sleep: async () => { sleeps += 1; }
  }), /Failed to initialize e-paper table 7/);

  assert.equal(attempts.get(7), 1);
  assert.equal(sleeps, 0);
});

test("startup does not retry a validation display failure", async () => {
  let attempts = 0;

  await assert.rejects(() => initializeTableDisplays({
    epaperClient: {
      async updateTableWelcome(tableNumber) {
        if (tableNumber === 7) {
          attempts += 1;
          throw new Error("url must be an http or https URL");
        }
        return { ok: true };
      }
    },
    attempts: 3,
    sleep: async () => {}
  }), /Failed to initialize e-paper table 7/);

  assert.equal(attempts, 1);
});

test("startup failure prevents the HTTP listener", async () => {
  let listened = false;
  await assert.rejects(() => start({
    epaperClient: { updateTableWelcome: async () => { throw new Error("offline"); } },
    attempts: 2,
    sleep: async () => {},
    listen: () => { listened = true; }
  }), /Failed to initialize e-paper table/);
  assert.equal(listened, false);
});

test("startup rejects an unconfigured e-paper client", async () => {
  let updates = 0;
  await assert.rejects(() => initializeTableDisplays({
    epaperClient: { updateTableWelcome: async () => { updates += 1; return { skipped: true }; } },
    attempts: 3,
    sleep: async () => {}
  }), /Failed to initialize e-paper table/);
  assert.equal(updates, 12);
});

test("startup rejects invalid attempt counts before display updates", async () => {
  for (const attempts of [0, -1, 1.5, "3", NaN]) {
    let updates = 0;
    await assert.rejects(() => initializeTableDisplays({
      epaperClient: { updateTableWelcome: async () => { updates += 1; } },
      attempts
    }), /attempts must be a positive integer/);
    assert.equal(updates, 0);
  }
});

test("default startup rejects missing production configuration before updates or listening", async () => {
  const originalEnvironment = { ...process.env };
  const originalFetch = globalThis.fetch;
  const configuredEnvironment = {
    EPAPER_HUB_URL: "https://epaper-hub.example.test",
    EPAPER_API_KEY: "epaper-key",
    API_KEY: "hub-key",
    ORDER_BASE_URL: "https://order.yeyintlwin.com"
  };
  try {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("unexpected e-paper request");
    };
    for (const { missing } of [
      { missing: ["EPAPER_HUB_URL"] },
      { missing: ["EPAPER_API_KEY", "API_KEY"] },
      { missing: ["ORDER_BASE_URL"] }
    ]) {
      Object.assign(process.env, configuredEnvironment);
      for (const variable of missing) delete process.env[variable];
      let listened = false;
      await assert.rejects(() => start({
        server: {},
        listen: () => { listened = true; },
        attempts: 1,
        sleep: async () => {}
      }), /E-paper startup configuration is incomplete/);
      assert.equal(listened, false);
    }
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, originalEnvironment);
  }
});

test("startup accepts an injected e-paper client without production configuration", async () => {
  const originalEnvironment = { ...process.env };
  try {
    delete process.env.EPAPER_HUB_URL;
    delete process.env.EPAPER_API_KEY;
    delete process.env.API_KEY;
    delete process.env.ORDER_BASE_URL;
    let updates = 0;
    let listened = false;

    await start({
      epaperClient: {
        updateTableWelcome: async () => { updates += 1; return { ok: true }; }
      },
      server: {},
      listen: () => { listened = true; }
    });

    assert.equal(updates, 12);
    assert.equal(listened, true);
  } finally {
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, originalEnvironment);
  }
});

test("default startup listener resolves only after listening", async () => {
  const server = new EventEmitter();
  let ready;
  server.listen = (_port, callback) => {
    ready = callback;
    return server;
  };
  let settled = false;
  const starting = start({
    epaperClient: { updateTableWelcome: async () => ({ ok: true }) },
    server,
    port: 0
  }).then(() => { settled = true; });

  await new Promise(setImmediate);
  assert.equal(settled, false);
  ready();
  await starting;
  assert.equal(settled, true);
});

test("default startup listener rejects asynchronous errors", async () => {
  const server = new EventEmitter();
  const failure = new Error("address unavailable");
  server.on("error", () => {});
  server.listen = () => {
    process.nextTick(() => server.emit("error", failure));
    return server;
  };

  await assert.rejects(() => start({
    epaperClient: { updateTableWelcome: async () => ({ ok: true }) },
    server,
    port: 0
  }), /address unavailable/);
});

test("placing first order updates e-paper once with the current opaque URL", async () => {
  const epaperUpdates = [];
  const visitStore = createVisitStore();
  const server = createCustomerServer({
    now: () => new Date("2026-07-19T10:00:00Z"),
    visitStore,
    epaperClient: {
      updateTableInUse: async (tableNumber, orderingUrl) => {
        epaperUpdates.push({ tableNumber, orderingUrl });
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
  assert.deepEqual(epaperUpdates, [{ tableNumber: 4, orderingUrl: visitStore.getOrderingUrl(4) }]);
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

test("authorized provisioning preserves the current Welcome visit URL and generation", async () => {
  const updates = [];
  const visitStore = createVisitStore();
  const before = visitStore.getCurrentVisit(7);
  const server = createCustomerServer({
    tableDisplayApiKey: "display-secret",
    visitStore,
    epaperClient: displayClient(async (tableNumber, orderingUrl) => {
      updates.push({ tableNumber, orderingUrl });
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
  assert.deepEqual(updates, [{ tableNumber: 7, orderingUrl: before.orderingUrl }]);
  assert.deepEqual(visitStore.getCurrentVisit(7), before);
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
