# Secure Table QR And Multi-Phone Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace predictable table-number QR URLs with concise opaque visit tokens, authorize customer APIs through per-phone sessions, and rotate the QR plus revoke every phone session after checkout.

**Architecture:** A focused in-memory access store owns current table visits, 128-bit QR tokens, 128-bit phone sessions, business dates, and generations. The existing order store continues to own menu, orders, slips, and totals; the server resolves a phone cookie to a visit before calling it. Checkout serializes the table transition, invalidates the old visit first, creates one pending replacement token, updates the e-paper through the existing SDK, and completes that same replacement on retry.

**Tech Stack:** Node.js 20, CommonJS, native `node:crypto`, native `node:http`, `Intl.DateTimeFormat`, `node:test`, existing `@restaurant/epaper-hub-sdk`, Docker Compose, GitHub Actions.

## Global Constraints

- QR URLs use `https://order.yeyintlwin.com/t/` followed by exactly 22 Base64URL characters generated from 16 random bytes.
- QR tokens expose no shop ID, date, table number, generation, or validity data.
- Server records contain `SHOP_ID=1`, Asia/Tokyo business date, table number, generation, token hash, status, and 06:00 expiry.
- Multiple phones may enroll with one current QR token and receive different phone sessions for the same table visit and slip.
- `GET /api/session`, `POST /api/orders`, and `POST /api/staff-calls` trust only the validated `rsid` cookie, never client table fields.
- Customer mutation requests require JSON and an `Origin` matching `ORDER_BASE_URL`.
- QR tokens remain unchanged during an active visit and rotate only at checkout, startup, or the accepted 06:00 safety rollover.
- Checkout invalidates the old QR and all attached phone sessions before attempting the replacement e-paper update.
- A failed checkout display update retains one pending replacement token for idempotent retry.
- Raw QR tokens, phone sessions, cookies, authorization headers, and credential values never appear in logs or API responses.
- Startup invalidates all previous in-memory credentials, creates 12 unique visits, updates all screens, and listens only after success.
- The e-paper hub and public SDK API shape remain unchanged; SDK tests and all relevant documentation change with integration behavior.

---

### Task 1: Build The Table Visit And Phone Session Store

**Files:**
- Create: `apps/customer-order/table-visit-store.js`
- Create: `apps/customer-order/test/table-visit-store.test.js`

**Interfaces:**
- Produces: `createTableVisitStore(options)`.
- Produces methods: `createInitialVisits()`, `getCurrentVisit(tableNumber)`, `getOrderingUrl(tableNumber)`, `getRawTokenForDisplay(tableNumber)`, `enroll(rawToken)`, `resolvePhoneSession(rawSession)`, `markInUse(tableNumber)`, `beginRotation(tableNumber)`, `completeRotation(tableNumber)`, and `expiredTableNumbers()`.
- Public visit snapshots never contain raw tokens, token hashes, or phone-session hashes.

- [x] **Step 1: Write failing token and visit tests**

Create deterministic random bytes and assert exact token shape, uniqueness, metadata, URL length, and redaction:

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { createTableVisitStore } = require("../table-visit-store");

function deterministicRandom() {
  let value = 0;
  return (size) => Buffer.alloc(size, value++);
}

test("creates twelve concise unique table visits without exposing secrets", () => {
  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    now: () => new Date("2026-07-22T03:00:00.000Z"),
    randomBytes: deterministicRandom()
  });

  const visits = store.createInitialVisits();
  assert.equal(visits.length, 12);
  assert.equal(new Set(visits.map((visit) => visit.orderingUrl)).size, 12);
  assert.match(visits[0].orderingUrl, /^https:\/\/order\.yeyintlwin\.com\/t\/[A-Za-z0-9_-]{22}$/);
  assert.equal(visits[0].businessDate, "2026-07-22");
  assert.equal(visits[0].shopId, "1");
  assert.equal(visits[0].generation, 1);
  assert.equal("token" in visits[0], false);
  assert.equal("tokenHash" in visits[0], false);
});
```

- [x] **Step 2: Run the store test and verify RED**

Run: `npm --prefix apps/customer-order test -- test/table-visit-store.test.js`

Expected: FAIL because `table-visit-store.js` does not exist.

- [x] **Step 3: Write failing multi-phone and revocation tests**

```js
test("enrolls multiple phones into one visit and revokes both on rotation", () => {
  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    now: () => new Date("2026-07-22T03:00:00.000Z"),
    randomBytes: deterministicRandom()
  });
  store.createInitialVisits();
  const token = store.getRawTokenForDisplay(7);
  const first = store.enroll(token);
  const second = store.enroll(token);

  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(first.visit.tableNumber, 7);
  assert.equal(second.visit.generation, first.visit.generation);

  const rotation = store.beginRotation(7);
  assert.equal(store.resolvePhoneSession(first.sessionId), null);
  assert.equal(store.resolvePhoneSession(second.sessionId), null);
  assert.equal(store.enroll(token), null);
  assert.equal(store.beginRotation(7).orderingUrl, rotation.orderingUrl);
});
```

- [x] **Step 4: Implement the minimal store**

Use maps keyed by table number, SHA-256 token hash, and SHA-256 phone-session hash. Keep raw display tokens only in a private map. Generate both credential types with:

```js
function randomId(randomBytes) {
  return randomBytes(16).toString("base64url");
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
```

For Tokyo business time, convert the instant to fixed JST and use 06:00 rollover:

```js
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function businessClock(instant) {
  const jst = new Date(instant.getTime() + JST_OFFSET_MS);
  const shifted = new Date(jst.getTime() - 6 * 60 * 60 * 1000);
  const businessDate = shifted.toISOString().slice(0, 10);
  const nextRolloverJst = Date.UTC(
    jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + (jst.getUTCHours() >= 6 ? 1 : 0), 6
  );
  return {
    businessDate,
    expiresAt: new Date(nextRolloverJst - JST_OFFSET_MS).toISOString()
  };
}
```

Validate `shopId`, production base URL, table IDs, raw credential shape, and expired/closed/pending states. Return snapshots through one redacting helper.

- [x] **Step 5: Add expiry and pending-rotation tests**

Use a mutable fake clock. Assert that enrollment and phone resolution return `null` at expiry, `expiredTableNumbers()` lists the table, `beginRotation()` increments generation once, and `completeRotation()` changes `pending_display` to `welcome` without replacing its URL.

- [x] **Step 6: Run focused tests and verify GREEN**

Run: `npm --prefix apps/customer-order test -- test/table-visit-store.test.js`

Expected: all table-visit-store tests PASS.

- [x] **Step 7: Commit**

```bash
git add apps/customer-order/table-visit-store.js apps/customer-order/test/table-visit-store.test.js
git commit -m "Add secure table visit token store"
```

---

### Task 2: Pass Opaque URLs Through The E-Paper Integration

**Files:**
- Modify: `apps/customer-order/epaper-client.js`
- Modify: `apps/customer-order/test/epaper-client.test.js`
- Modify: `apps/customer-order/server.js`
- Modify: `apps/customer-order/test/server.test.js`
- Modify: `packages/epaper-hub-sdk/test/table-template.test.js`

**Interfaces:**
- Consumes: `visitStore.getOrderingUrl(tableNumber)` and `visitStore.getCurrentVisit(tableNumber)`.
- Produces: `epaperClient.updateTableWelcome(tableNumber, orderingUrl)` and `epaperClient.updateTableInUse(tableNumber, orderingUrl)`.
- Produces: `initializeTableDisplays({ epaperClient, visitStore, ... })`.
- Preserves: the protected manual Welcome provisioning route re-renders the table's current opaque URL and does not rotate an active credential.

- [x] **Step 1: Write failing exact-URL client tests**

Change the client expectations to pass the URL explicitly:

```js
const opaqueUrl = "https://order.yeyintlwin.com/t/AAAAAAAAAAAAAAAAAAAAAA";
await client.updateTableWelcome(7, opaqueUrl);
assert.deepEqual(JSON.parse(requests[0].options.body), renderTableDisplay({
  tableNumber: 7,
  status: "Welcome",
  url: opaqueUrl
}));
```

Add the same assertion for `updateTableInUse`; verify missing or malformed URL is rejected by the existing SDK renderer.

- [x] **Step 2: Add the production QR-fit regression test**

In `packages/epaper-hub-sdk/test/table-template.test.js`:

```js
test("fits a production opaque table visit URL", () => {
  const payload = renderTableDisplay({
    tableNumber: 12,
    status: "Table is in use",
    url: "https://order.yeyintlwin.com/t/______________________"
  });
  assert.equal(payload.frame.width, 296);
  assert.equal(payload.frame.height, 128);
});
```

- [x] **Step 3: Run focused tests and verify RED**

Run: `npm --prefix apps/customer-order test -- test/epaper-client.test.js`

Expected: FAIL because the client still builds `?table=N`.

- [x] **Step 4: Simplify the local e-paper client**

Remove `orderingUrlFor`. Require the exact URL:

```js
async function updateTableStatus(tableNumber, status, orderingUrl) {
  if (!sdk) return { skipped: true };
  return sdk.updateTableDisplay({
    epaperId: tableNumber,
    tableNumber,
    status,
    url: orderingUrl
  });
}
```

- [x] **Step 5: Make startup create and render 12 visits**

`start()` constructs one visit store, calls `createInitialVisits()`, passes it to `createServer`, and calls:

```js
await initializeTableDisplays({ ...options, epaperClient, visitStore });
```

Each retry uses the stable current URL:

```js
epaperClient.updateTableWelcome(tableNumber, visitStore.getOrderingUrl(tableNumber));
```

Add a test proving 12 unique `/t/` URLs are used before listening and that a retry for one table reuses that table's same URL.

Update the existing protected manual Welcome provisioning handler to read `visitStore.getOrderingUrl(tableNumber)`. Its tests must prove that provisioning preserves the current visit generation and URL; only checkout and business rollover rotate credentials.

- [x] **Step 6: Run customer and SDK tests**

Run: `npm --prefix apps/customer-order test -- test/epaper-client.test.js test/server.test.js`

Run: `npm --prefix packages/epaper-hub-sdk test -- test/table-template.test.js`

Expected: all focused tests PASS.

- [x] **Step 7: Commit**

```bash
git add apps/customer-order/epaper-client.js apps/customer-order/test/epaper-client.test.js apps/customer-order/server.js apps/customer-order/test/server.test.js packages/epaper-hub-sdk/test/table-template.test.js
git commit -m "Render opaque table visit URLs"
```

---

### Task 3: Enroll Phones And Authorize Customer APIs

**Files:**
- Modify: `apps/customer-order/server.js`
- Modify: `apps/customer-order/test/server.test.js`
- Modify: `apps/customer-order/public/app.js`
- Modify: `apps/customer-order/public/index.html`
- Modify: `apps/customer-order/test/public-ui.test.js`

**Interfaces:**
- Consumes: `visitStore.enroll(token)` and `visitStore.resolvePhoneSession(sessionId)`.
- Produces: `GET /t/:token`, `rsid` cookie, authenticated session/order/staff endpoints, and rescan-required UI.

- [x] **Step 1: Write failing enrollment tests**

Create a visit store fixture, obtain table 7's raw display token, and request `/t/:token`. Assert:

```js
assert.equal(response.status, 302);
assert.equal(response.headers.Location, "/");
assert.match(response.headers["Set-Cookie"], /^rsid=[A-Za-z0-9_-]{22}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=\d+$/);
assert.equal(response.headers["Cache-Control"], "no-store");
assert.doesNotMatch(response.headers.Location, /table|shop|date/);
```

Malformed, unknown, expired, and superseded tokens must return the same `410` body.

- [x] **Step 2: Write failing authorization and multi-phone tests**

Enroll two cookies with one QR. Place an order from phone one and read `/api/session` from phone two. Assert both see table 7, the same slip, and the same order. Then send `table_number: 12` from phone one and assert the new order still belongs to table 7.

Also assert missing/forged cookies return `401` for all three protected customer endpoints.

- [x] **Step 3: Run server tests and verify RED**

Run: `npm --prefix apps/customer-order test -- test/server.test.js`

Expected: FAIL because QR enrollment and cookie authorization do not exist.

- [x] **Step 4: Add cookie, origin, and visit helpers**

Use small local helpers:

```js
function cookieValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

function authorizedVisit(req, visitStore) {
  return visitStore.resolvePhoneSession(cookieValue(req.headers.cookie, "rsid"));
}
```

For POST customer routes, require `Content-Type: application/json` and `Origin` equal to `new URL(ORDER_BASE_URL).origin`; return `403` for mismatch before reading or mutating data.

- [x] **Step 5: Implement QR enrollment and protected APIs**

Enrollment hashes the path token through the store and emits `302`, secure cookie, and `no-store`. Protected handlers derive `tableNumber` from the visit:

```js
const visit = authorizedVisit(req, visitStore);
if (!visit) return sendJson(res, 401, { error: "Scan the current table QR to continue" });

const result = store.placeOrder({ tableNumber: visit.tableNumber, items: body.items });
```

Preserve the current visit QR when updating `Table is in use`:

```js
epaperClient.updateTableInUse(visit.tableNumber, visitStore.getOrderingUrl(visit.tableNumber));
```

- [x] **Step 6: Update the browser to use its cookie session**

Remove `getTableNumber()` and all `table_number` request fields. Initialize with:

```js
const [menu, sessionResult] = await Promise.all([
  api("/api/menu"),
  api("/api/session")
]);
state.tableNumber = sessionResult.session.tableNumber;
```

On `401` or `410`, add a `rescanRequired` class to the document, show `Scan the current table QR to continue`, and disable ordering/staff actions. Keep checkout barcode behavior unchanged.

- [x] **Step 7: Run server and UI tests**

Run: `npm --prefix apps/customer-order test -- test/server.test.js test/public-ui.test.js`

Expected: all focused tests PASS, including two-phone shared-order and cross-table injection tests.

- [x] **Step 8: Commit**

```bash
git add apps/customer-order/server.js apps/customer-order/test/server.test.js apps/customer-order/public/app.js apps/customer-order/public/index.html apps/customer-order/test/public-ui.test.js
git commit -m "Authorize ordering through QR phone sessions"
```

---

### Task 4: Rotate QR And Revoke Sessions At Checkout

**Files:**
- Modify: `apps/customer-order/order-store.js`
- Modify: `apps/customer-order/test/order-store.test.js`
- Modify: `apps/customer-order/server.js`
- Modify: `apps/customer-order/test/server.test.js`
- Modify: `apps/customer-order/test/public-ui.test.js`

**Interfaces:**
- Consumes: `visitStore.beginRotation(tableNumber)` and `visitStore.completeRotation(tableNumber)`.
- Produces: `orderStore.closeSession(tableNumber)` and protected `POST /api/tables/:tableNumber/checkout`.

- [x] **Step 1: Write the failing order-store close test**

```js
test("checkout returns the final session and resets the table order state", () => {
  const store = createOrderStore({ now: () => new Date("2026-07-22T03:00:00Z") });
  const placed = store.placeOrder({ tableNumber: 7, items: [{ id: "crispy-gyoza", quantity: 1 }] });
  const closed = store.closeSession(7);

  assert.equal(closed.slipNumber, placed.session.slipNumber);
  assert.equal(closed.status, "Table is in use");
  assert.equal(store.getSession(7).slipNumber, null);
});
```

- [x] **Step 2: Implement `closeSession` and verify GREEN**

Delete the table key only after taking a redacted snapshot. Return `null` when no stored order session exists.

Run: `npm --prefix apps/customer-order test -- test/order-store.test.js`

Expected: all order-store tests PASS.

- [x] **Step 3: Write failing checkout security and rotation tests**

Test missing/wrong bearer authorization, noncanonical table IDs, old QR returning `410`, two old phone cookies returning `401`, new token differing from old, and e-paper receiving `WELCOME` plus the new URL.

Use same-length wrong bearer coverage and assert `/api/config` and browser assets do not expose `CHECKOUT_API_KEY`.

- [x] **Step 4: Write the failing e-paper failure retry test**

Make the first Welcome update reject. Assert first checkout returns safe `502`; old QR and phones are already invalid; the second authorized checkout reuses the exact same pending URL and returns `200` without incrementing generation again.

- [x] **Step 5: Run checkout tests and verify RED**

Run: `npm --prefix apps/customer-order test -- --test-name-pattern='checkout' test/server.test.js test/order-store.test.js`

Expected: FAIL because checkout behavior does not exist.

- [x] **Step 6: Implement serialized checkout**

Read `CHECKOUT_API_KEY` from server options or environment and use `bearerMatches`. Inside the existing same-table display chain:

```js
const replacement = visitStore.beginRotation(tableNumber);
store.closeSession(tableNumber);
try {
  await epaperClient.updateTableWelcome(tableNumber, replacement.orderingUrl);
  visitStore.completeRotation(tableNumber);
  return { status: 200, body: { ok: true, tableNumber, status: "Welcome" } };
} catch {
  return { status: 502, body: { error: "E-paper display update failed" } };
}
```

`beginRotation` must return the existing `pending_display` replacement on retry. Never include the replacement URL or token in the HTTP response.

- [x] **Step 7: Run checkout and full customer tests**

Run: `npm --prefix apps/customer-order test -- test/order-store.test.js test/server.test.js test/public-ui.test.js`

Run: `npm --prefix apps/customer-order test`

Expected: all customer-order tests PASS.

- [x] **Step 8: Commit**

```bash
git add apps/customer-order/order-store.js apps/customer-order/test/order-store.test.js apps/customer-order/server.js apps/customer-order/test/server.test.js apps/customer-order/test/public-ui.test.js
git commit -m "Rotate table access after checkout"
```

---

### Task 5: Enforce Business-Day Rollover And Production Configuration

**Files:**
- Modify: `apps/customer-order/server.js`
- Modify: `apps/customer-order/test/server.test.js`
- Modify: `apps/customer-order/.env.example`
- Modify: `apps/epaper-hub/docker-compose.yml`
- Modify: `apps/epaper-hub/test/deploy-config.test.js`

**Interfaces:**
- Consumes: `visitStore.expiredTableNumbers()` and the same checkout rotation path.
- Produces: scheduled `reconcileExpiredVisits()` and required startup configuration.

- [x] **Step 1: Write failing rollover reconciliation tests**

Inject a fake scheduler and clock. Advance across 06:00 JST, run the scheduled callback, and assert expired phone sessions fail, each expired table gets exactly one replacement URL, and e-paper receives `WELCOME` with that URL.

Add failure/retry coverage proving a failed table keeps one pending URL and unrelated tables complete.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix apps/customer-order test -- --test-name-pattern='rollover' test/server.test.js test/table-visit-store.test.js`

Expected: FAIL because no rollover scheduler exists.

- [x] **Step 3: Extract one reusable table rotation operation**

Use one server-local function for checkout and rollover:

```js
async function rotateTableDisplay(tableNumber) {
  const replacement = visitStore.beginRotation(tableNumber);
  store.closeSession(tableNumber);
  await epaperClient.updateTableWelcome(tableNumber, replacement.orderingUrl);
  return visitStore.completeRotation(tableNumber);
}
```

Serialize it through `runTableDisplayUpdate`. Schedule the next 06:00 JST after startup and reschedule after every callback. Call `unref()` on the native timer so tests and shutdown are not held open.

- [x] **Step 4: Require and document runtime values**

Add:

```dotenv
SHOP_ID=1
CHECKOUT_API_KEY=replace-with-independent-random-secret
BUSINESS_TIME_ZONE=Asia/Tokyo
BUSINESS_DAY_ROLLOVER_HOUR=6
```

Startup accepts only `Asia/Tokyo` and integer rollover `6` for this milestone, validates checkout key presence, and exits before creating visits or listening on invalid configuration.

Compose sets only non-secret defaults:

```yaml
BUSINESS_TIME_ZONE: Asia/Tokyo
BUSINESS_DAY_ROLLOVER_HOUR: 6
```

- [x] **Step 5: Run focused, Compose, and full tests**

Run: `npm --prefix apps/customer-order test`

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Run: `npm test`

Expected: all tests PASS, with only the documented sandbox port-binding skip allowed.

- [x] **Step 6: Commit**

```bash
git add apps/customer-order/server.js apps/customer-order/test/server.test.js apps/customer-order/.env.example apps/epaper-hub/docker-compose.yml apps/epaper-hub/test/deploy-config.test.js
git commit -m "Expire table visits at business rollover"
```

---

### Task 6: Synchronize SDK, API, Operations, And Security Documentation

**Files:**
- Modify: `README.md`
- Modify: `apps/customer-order/README.md`
- Modify: `apps/epaper-hub/README.md`
- Modify: `packages/epaper-hub-sdk/README.md`
- Modify: `infra/README.md`
- Modify: `apps/epaper-hub/test/deploy-config.test.js`

**Interfaces:**
- Documents: opaque token format, multi-phone enrollment, cookie authorization, accepted active-visit photo limitation, checkout contract, 06:00 expiry, and runtime secrets.

- [x] **Step 1: Write failing documentation assertions**

Extend deployment configuration tests to read all required documentation and assert it includes `/t/`, `SHOP_ID=1`, `CHECKOUT_API_KEY`, `HttpOnly`, multiple phones, checkout revocation, and 06:00 Asia/Tokyo expiry. Assert it no longer instructs clients to order with `?table=N` or JSON `table_number`.

- [x] **Step 2: Run focused test and verify RED**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: FAIL on the new secure-QR documentation assertions.

- [x] **Step 3: Update all required documentation**

Document these exact contracts:

```text
QR shape: https://order.yeyintlwin.com/t/AAAAAAAAAAAAAAAAAAAAAA
Enrollment: secure rsid cookie, multiple phones share one visit
Customer APIs: table is derived only from rsid
Checkout: protected server-to-server endpoint rotates QR and revokes all phones
Expiry: 06:00 Asia/Tokyo safety rollover
```

State explicitly that a photograph taken before checkout remains usable during that active visit because mobile data and a shared non-rotating QR were selected.

- [x] **Step 4: Run full verification**

Run: `npm test`

Run: `git diff --check`

Expected: all tests PASS and whitespace check produces no output.

- [x] **Step 5: Commit**

```bash
git add README.md apps/customer-order/README.md apps/epaper-hub/README.md packages/epaper-hub-sdk/README.md infra/README.md apps/epaper-hub/test/deploy-config.test.js
git commit -m "Document secure table QR lifecycle"
```

---

### Task 7: Deploy And Verify The Complete Security Lifecycle

**Files:**
- No source changes expected.

**Interfaces:**
- Verifies: GitHub Actions, Lightsail environment, startup tokens, multiple phones, cross-table rejection, checkout rotation, old credential revocation, e-paper update, and public HTTPS.

- [ ] **Step 1: Add production secrets without printing values**

Over SSH, add `SHOP_ID=1`, `BUSINESS_TIME_ZONE=Asia/Tokyo`, `BUSINESS_DAY_ROLLOVER_HOUR=6`, and a new independent 32-byte `CHECKOUT_API_KEY` to `~/restaurant-order-system.env`. Keep mode `600` and print only variable names.

- [ ] **Step 2: Push and watch the exact GitHub Actions run**

Push the completed branch or merged `main`, capture the run URL, and wait for tests, both image builds, upload, and Lightsail deployment to succeed.

- [ ] **Step 3: Verify startup and QR shape**

Confirm both containers run the expected commit image. Read the hub's 12 startup POST results, then inspect rendered frames or captured SDK requests to confirm 12 distinct production `/t/` URLs fit and no `?table=` URL remains.

- [ ] **Step 4: Verify two-phone behavior**

Use two independent cookie jars against one current QR. Enroll both, place an order with phone one, and confirm phone two sees the same table, slip, order, and totals. Attempt `table_number: 12` from the table 7 cookie and confirm the order remains assigned to table 7.

- [ ] **Step 5: Verify checkout and old-photo rejection**

Call the protected checkout endpoint with the server-side checkout key without printing it. Confirm both old phone cookies return `401`, the photographed old QR returns `410`, the hub receives a new table-specific `WELCOME` frame, and the new QR enrolls a fresh phone into an empty visit.

- [ ] **Step 6: Verify retry safety**

Use automated test evidence for the forced e-paper failure path; do not disrupt the production hub. Confirm the test proves old credentials are invalid immediately and retry reuses one pending replacement token.

- [ ] **Step 7: Record completion evidence**

Record commit SHA, Actions URL, container states, public health result, 12-display startup count, two-phone shared slip, cross-table injection result, checkout response, old-token `410`, old-cookie `401`, and new-token enrollment. Never record raw tokens, cookies, or secret values.
