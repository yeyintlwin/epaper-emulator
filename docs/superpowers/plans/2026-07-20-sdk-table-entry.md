# SDK-Driven Table Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected customer-order endpoint that uses the e-paper hub SDK to display a table-specific `Welcome` screen and ordering QR for inactive tables before customers enter the ordering page.

**Architecture:** Extend the existing customer e-paper client with a shared status updater and `updateTableWelcome(tableNumber)` method. Add one authenticated server route that validates a separate bearer credential, rejects active sessions with `409`, invokes that method for inactive tables, and maps configuration and hub failures to explicit HTTP responses without changing order-session state. Session closure remains the responsibility of a future cashier checkout/session lifecycle; this route is not a reset API.

**Tech Stack:** Node.js 20, CommonJS, native `node:http`, native `node:crypto`, `node:test`, `@restaurant/epaper-hub-sdk`.

## Global Constraints

- E-paper IDs and table numbers are integers from 1 through 12.
- The ordering URL is built from `ORDER_BASE_URL` with the exact table number in the `table` query parameter.
- `TABLE_DISPLAY_API_KEY`, `EPAPER_API_KEY`, and `API_KEY` remain server-side and never appear in `/api/config` or browser assets.
- The provisioning endpoint uses a constant-time bearer-token comparison.
- Server startup must not automatically reset displays to `Welcome`.
- Checkout continues to use its existing barcode.
- Active sessions return `409`; no checkout or session-close API is added by this feature.
- The e-paper hub API and `@restaurant/epaper-hub-sdk` public API remain unchanged.

---

### Task 1: Add The Welcome Display Client Method

**Files:**
- Modify: `apps/customer-order/test/epaper-client.test.js`
- Modify: `apps/customer-order/epaper-client.js`

**Interfaces:**
- Consumes: `createEpaperHubSdk({ baseUrl, apiKey, fetchImpl })` and `sdk.updateTableDisplay({ epaperId, tableNumber, status, url })`.
- Produces: `createEpaperClient(options).updateTableWelcome(tableNumber)` and the existing `updateTableInUse(tableNumber)`.

- [ ] **Step 1: Write the failing Welcome display test**

Add this test beside the existing authenticated update test in `apps/customer-order/test/epaper-client.test.js`:

```js
test("renders a Welcome QR that opens the requested table order page", async () => {
  const requests = [];
  const client = createEpaperClient({
    hubUrl: "https://epaper-hub.example.test/",
    apiKey: "secret-key",
    orderBaseUrl: "https://order.example.test/food?campaign=summer",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ ok: true }) };
    }
  });

  await client.updateTableWelcome(7);

  assert.equal(requests[0].url, "https://epaper-hub.example.test/api/epapers/7");
  assert.deepEqual(
    JSON.parse(requests[0].options.body),
    renderTableDisplay({
      tableNumber: 7,
      status: "Welcome",
      url: "https://order.example.test/food?campaign=summer&table=7"
    })
  );
});
```

Extend the missing-configuration test to assert both methods skip without fetching:

```js
assert.deepEqual(await client.updateTableWelcome(1), { skipped: true });
assert.deepEqual(await client.updateTableInUse(1), { skipped: true });
```

- [ ] **Step 2: Run the client test and verify RED**

Run:

```bash
npm --prefix apps/customer-order test -- test/epaper-client.test.js
```

Expected: FAIL with `client.updateTableWelcome is not a function`.

- [ ] **Step 3: Implement one shared SDK status updater**

Replace the duplicated table-status logic inside `createEpaperClient` with:

```js
function orderingUrlFor(tableNumber) {
  const orderingUrl = new URL(orderBaseUrl || "https://order.yeyintlwin.com");
  orderingUrl.searchParams.set("table", tableNumber);
  return orderingUrl.toString();
}

async function updateTableStatus(tableNumber, status) {
  if (!sdk) return { skipped: true };
  return sdk.updateTableDisplay({
    epaperId: tableNumber,
    tableNumber,
    status,
    url: orderingUrlFor(tableNumber)
  });
}

return {
  updateTableWelcome: (tableNumber) => updateTableStatus(tableNumber, "Welcome"),
  updateTableInUse: (tableNumber) => updateTableStatus(tableNumber, "Table is in use")
};
```

Remove the unused `session` argument from the local implementation. Existing callers may still pass it because extra JavaScript arguments are ignored.

- [ ] **Step 4: Run the client tests and verify GREEN**

Run:

```bash
npm --prefix apps/customer-order test -- test/epaper-client.test.js
```

Expected: all e-paper client tests pass.

- [ ] **Step 5: Commit the client behavior**

```bash
git add apps/customer-order/epaper-client.js apps/customer-order/test/epaper-client.test.js
git commit -m "Add Welcome table display client"
```

### Task 2: Add The Protected Provisioning Endpoint

**Files:**
- Modify: `apps/customer-order/test/server.test.js`
- Modify: `apps/customer-order/server.js`

**Interfaces:**
- Consumes: `epaperClient.updateTableWelcome(tableNumber) -> Promise<object>`.
- Produces: `POST /api/table-displays/:tableNumber/welcome` with bearer authentication.
- Produces: `server.inject(method, url, body, headers)` for authenticated route tests.

- [ ] **Step 1: Write failing endpoint tests**

Add a helper to `apps/customer-order/test/server.test.js`:

```js
function displayClient(updateTableWelcome) {
  return {
    updateTableWelcome,
    updateTableInUse: async () => ({ ok: true })
  };
}
```

Add the successful provisioning test:

```js
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
```

Add authentication and validation tests:

```js
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
```

Add configuration and hub-failure tests:

```js
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
```

- [ ] **Step 2: Run the server tests and verify RED**

Run:

```bash
npm --prefix apps/customer-order test -- test/server.test.js
```

Expected: the new endpoint tests fail because the route and header injection do not exist.

- [ ] **Step 3: Add constant-time bearer authentication**

At the top of `apps/customer-order/server.js`, add:

```js
const crypto = require("node:crypto");
```

Add this helper beside `sendJson`:

```js
function bearerMatches(header, expected) {
  const prefix = "Bearer ";
  if (!String(header || "").startsWith(prefix) || !expected) return false;
  const supplied = Buffer.from(String(header).slice(prefix.length));
  const configured = Buffer.from(String(expected));
  return supplied.length === configured.length && crypto.timingSafeEqual(supplied, configured);
}
```

In `createServer`, capture configuration without changing global environment state:

```js
const tableDisplayApiKey = options.tableDisplayApiKey ?? process.env.TABLE_DISPLAY_API_KEY;
```

- [ ] **Step 4: Implement the provisioning route**

Add this route before the order route:

```js
const welcomeRoute = url.pathname.match(/^\/api\/table-displays\/(\d+)\/welcome$/);
if (req.method === "POST" && welcomeRoute) {
  if (!tableDisplayApiKey) {
    return sendJson(res, 503, { error: "Table display provisioning is not configured" });
  }
  if (!bearerMatches(req.headers.authorization, tableDisplayApiKey)) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  const tableNumber = Number(welcomeRoute[1]);
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > MAX_TABLE_NUMBER) {
    return sendJson(res, 400, { error: `table number must be between 1 and ${MAX_TABLE_NUMBER}` });
  }

  try {
    const result = await epaperClient.updateTableWelcome(tableNumber);
    if (result?.skipped) {
      return sendJson(res, 503, { error: "E-paper hub is not configured" });
    }
    return sendJson(res, 200, { ok: true, tableNumber, status: "Welcome" });
  } catch {
    return sendJson(res, 502, { error: "E-paper display update failed" });
  }
}
```

Change the injector declaration from:

```js
server.inject = async (method, url, body) => {
```

to:

```js
server.inject = async (method, url, body, headers = {}) => {
```

Inside the injector's `req` object, change:

```js
headers: {},
```

to:

```js
headers,
```

- [ ] **Step 5: Run customer-order tests and verify GREEN**

Run:

```bash
npm --prefix apps/customer-order test
```

Expected: all customer-order tests pass, including first-order retry behavior and secret non-exposure.

- [ ] **Step 6: Commit the protected endpoint**

```bash
git add apps/customer-order/server.js apps/customer-order/test/server.test.js
git commit -m "Add protected table display provisioning"
```

### Task 3: Document Configuration And Verify The Repository

**Files:**
- Modify: `apps/customer-order/.env.example`
- Modify: `apps/customer-order/README.md`
- Modify: `README.md`
- Modify: `apps/customer-order/test/server.test.js`

**Interfaces:**
- Documents: `TABLE_DISPLAY_API_KEY`, `ORDER_BASE_URL`, and `POST /api/table-displays/:tableNumber/welcome`.
- Verifies: `/api/config` exposes neither display nor hub credentials.

- [ ] **Step 1: Strengthen the frontend secret test**

Extend `frontend config endpoint does not expose e-paper secrets` in `apps/customer-order/test/server.test.js`:

```js
assert.equal(response.body.epaperApiKey, undefined);
assert.equal(response.body.tableDisplayApiKey, undefined);
assert.equal(response.body.apiKey, undefined);
assert.equal(response.body.maxTableNumber, 12);
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
npm --prefix apps/customer-order test -- test/server.test.js
```

Expected: PASS because `/api/config` already returns only public configuration; this assertion records the security boundary.

- [ ] **Step 3: Update environment documentation**

Add to `apps/customer-order/.env.example`:

```dotenv
TABLE_DISPLAY_API_KEY=replace-with-a-separate-long-random-secret
```

Document in `apps/customer-order/README.md`:

````markdown
## Initialize A Table Display

```bash
curl -X POST "http://localhost:3100/api/table-displays/7/welcome" \
  -H "Authorization: Bearer $TABLE_DISPLAY_API_KEY"
```

This securely uses the server-side e-paper SDK to display table 7, `Welcome`, and a QR for `${ORDER_BASE_URL}?table=7`. Run it when preparing an inactive table; server startup does not reset displays automatically. Active tables return `409` and are not reset by this endpoint.
````

Add the same endpoint and production URL example to the root `README.md`, using `https://order.yeyintlwin.com` as `ORDER_BASE_URL`.

- [ ] **Step 4: Run the complete verification gate**

Run:

```bash
npm ci --prefix packages/epaper-hub-sdk
npm ci --prefix apps/customer-order --workspaces=false
npm test
git diff --check
```

Expected:

- SDK clean install succeeds.
- Customer-order clean install succeeds with the local SDK dependency.
- All SDK, e-paper hub, and customer-order tests pass; only the existing sandbox port-binding test may be skipped.
- `git diff --check` prints no errors.

- [ ] **Step 5: Commit documentation and security assertion**

```bash
git add README.md apps/customer-order/.env.example apps/customer-order/README.md apps/customer-order/test/server.test.js
git commit -m "Document table display provisioning"
```
