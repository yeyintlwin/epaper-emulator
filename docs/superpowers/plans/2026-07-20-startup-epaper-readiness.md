# Startup E-Paper Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the customer-order service and reset all 12 e-paper displays to table-specific `WELCOME` ordering screens before the service accepts traffic on every startup.

**Architecture:** Add an exported customer-order bootstrap that validates configuration, updates tables 1 through 12 concurrently through the existing SDK client, retries bounded transient failures, and starts the HTTP listener only after all displays succeed. Deploy customer-order and e-paper-hub as two Docker Compose services, with customer-order using the private hub URL and GitHub Actions shipping both immutable images.

**Tech Stack:** Node.js 20, CommonJS, native `node:http`, native timers and promises, `node:test`, Docker Compose, GitHub Actions, `@restaurant/epaper-hub-sdk`.

## Global Constraints

- Every customer-order startup resets all displays 1 through 12, including displays previously marked `Table is in use`.
- Each screen contains `WELCOME`, its exact table number, and `${ORDER_BASE_URL}?table=N` as the QR destination, where `N` is that display's integer ID from 1 through 12.
- The HTTP listener starts only after all 12 display updates succeed.
- Display updates run concurrently and retry transient failures with a bounded retry count and delay.
- Exhausted startup retries reject startup and prevent listening; Docker restarts the service.
- `EPAPER_HUB_URL=http://epaper-hub:3000` is private to Docker; `ORDER_BASE_URL=https://order.yeyintlwin.com` is public.
- Both services bind published ports to `127.0.0.1`; Nginx owns public HTTPS.
- Runtime secrets remain only in `~/restaurant-order-system.env` and never enter browser assets, API responses, images, logs, or the deployment folder.
- The server deployment folder contains only `docker-compose.yml` and optional `config/`.
- Keep the e-paper hub and SDK public APIs unchanged.

---

### Task 1: Add Blocking Startup Display Initialization

**Files:**
- Modify: `apps/customer-order/server.js`
- Modify: `apps/customer-order/test/server.test.js`
- Modify: `apps/customer-order/.env.example`

**Interfaces:**
- Consumes: `createEpaperClient(options).updateTableWelcome(tableNumber) -> Promise<object>`.
- Produces: `initializeTableDisplays(options) -> Promise<void>` and `start(options) -> Promise<http.Server>`.

- [ ] **Step 1: Write failing initialization tests**

Add tests using injected `epaperClient`, `sleep`, and `listen` dependencies. Assert that initialization calls IDs 1 through 12, retries a table after one rejection, and does not call `listen` until all updates finish.

```js
test("startup initializes all twelve Welcome displays before listening", async () => {
  const updates = [];
  let listened = false;
  const pending = [];
  const epaperClient = {
    updateTableWelcome(tableNumber) {
      updates.push(tableNumber);
      return new Promise((resolve) => pending.push(resolve));
    }
  };

  const starting = start({
    epaperClient,
    port: 0,
    listen: () => { listened = true; }
  });
  await new Promise(setImmediate);

  assert.deepEqual(updates, Array.from({ length: 12 }, (_, index) => index + 1));
  assert.equal(listened, false);
  pending.forEach((resolve) => resolve({ ok: true }));
  await starting;
  assert.equal(listened, true);
});

test("startup retries a transient display failure", async () => {
  const attempts = new Map();
  await initializeTableDisplays({
    epaperClient: {
      async updateTableWelcome(tableNumber) {
        const count = (attempts.get(tableNumber) || 0) + 1;
        attempts.set(tableNumber, count);
        if (tableNumber === 7 && count === 1) throw new Error("temporary");
        return { ok: true };
      }
    },
    attempts: 2,
    sleep: async () => {}
  });

  assert.equal(attempts.get(7), 2);
  assert.equal([...attempts.values()].reduce((sum, count) => sum + count, 0), 13);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix apps/customer-order test -- --test-name-pattern='startup' test/server.test.js`

Expected: FAIL because `start` and `initializeTableDisplays` are not exported.

- [ ] **Step 3: Add the exhausted-failure test**

```js
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
```

- [ ] **Step 4: Implement the minimum bootstrap**

In `server.js`, add a retry helper and concurrent table initialization. Treat SDK `{ skipped: true }` as configuration failure.

```js
async function initializeTableDisplays(options = {}) {
  const epaperClient = options.epaperClient;
  const attempts = options.attempts || 3;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const retryDelayMs = options.retryDelayMs ?? 1000;

  await Promise.all(Array.from({ length: MAX_TABLE_NUMBER }, async (_, index) => {
    const tableNumber = index + 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await epaperClient.updateTableWelcome(tableNumber);
        if (result?.skipped) throw new Error("E-paper hub is not configured");
        return;
      } catch (error) {
        if (attempt === attempts) {
          throw new Error(`Failed to initialize e-paper table ${tableNumber}`, { cause: error });
        }
        await sleep(retryDelayMs);
      }
    }
  }));
}
```

Add `start(options)` that creates or receives the SDK client and server, awaits `initializeTableDisplays`, and only then calls the injected/default listener. Make the CLI entry call `start().catch(...)`, log only the safe startup error message, and set `process.exitCode = 1`.

- [ ] **Step 5: Update startup configuration example**

Set the intended Docker value in the comments without exposing credentials:

```dotenv
EPAPER_HUB_URL=http://epaper-hub:3000
ORDER_BASE_URL=https://order.yeyintlwin.com
```

- [ ] **Step 6: Run focused and package tests**

Run: `npm --prefix apps/customer-order test -- test/server.test.js`

Expected: all server tests PASS.

Run: `npm --prefix apps/customer-order test`

Expected: all customer-order tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-order/server.js apps/customer-order/test/server.test.js apps/customer-order/.env.example
git commit -m "Initialize e-paper displays on order startup"
```

---

### Task 2: Package Both Runtime Services In Docker Compose

**Files:**
- Create: `apps/customer-order/Dockerfile`
- Modify: `apps/epaper-hub/docker-compose.yml`
- Modify: `apps/epaper-hub/test/deploy-config.test.js`

**Interfaces:**
- Consumes: customer-order `start()` and e-paper hub `GET /api/health`.
- Produces: Compose services `epaper-hub` and `customer-order`, with images selected by `EPAPER_IMAGE` and `CUSTOMER_ORDER_IMAGE`.

- [ ] **Step 1: Write failing deployment configuration assertions**

Extend `deploy-config.test.js` to assert:

```js
assert.match(compose, /customer-order:/);
assert.match(compose, /image: \$\{CUSTOMER_ORDER_IMAGE:-customer-order\}/);
assert.match(compose, /127\.0\.0\.1:3100:3100/);
assert.match(compose, /EPAPER_HUB_URL: http:\/\/epaper-hub:3000/);
assert.match(compose, /ORDER_BASE_URL: https:\/\/order\.yeyintlwin\.com/);
assert.match(compose, /condition: service_healthy/);
assert.match(compose, /restart: unless-stopped/);
assert.match(compose, /healthcheck:/);
```

Assert that the customer Dockerfile copies the SDK package and customer app, installs production dependencies, exposes 3100, and starts `server.js`.

- [ ] **Step 2: Run deploy tests and verify RED**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: FAIL because no customer-order image or Compose service exists.

- [ ] **Step 3: Reuse the existing hub health endpoint**

Configure the Compose health check to request the existing `GET /health` endpoint with Alpine's `wget`. Do not add another health API.

- [ ] **Step 4: Create the customer-order Dockerfile**

Use one Node 20 Alpine image and preserve the local SDK dependency layout:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY packages/epaper-hub-sdk ./packages/epaper-hub-sdk
COPY apps/customer-order ./apps/customer-order
RUN npm --prefix packages/epaper-hub-sdk install --omit=dev \
 && npm --prefix apps/customer-order install --omit=dev --workspaces=false
ENV NODE_ENV=production PORT=3100
EXPOSE 3100
CMD ["node", "apps/customer-order/server.js"]
```

The build context is the repository root so both package paths are available.

- [ ] **Step 5: Extend Docker Compose**

Keep the existing data volume. Add a hub health check and customer service:

```yaml
  customer-order:
    image: ${CUSTOMER_ORDER_IMAGE:-customer-order}
    container_name: customer-order
    restart: unless-stopped
    ports:
      - "127.0.0.1:3100:3100"
    env_file:
      - ${EPAPER_ENV_FILE:-.env}
    environment:
      PORT: 3100
      EPAPER_HUB_URL: http://epaper-hub:3000
      ORDER_BASE_URL: https://order.yeyintlwin.com
    depends_on:
      epaper-hub:
        condition: service_healthy
```

- [ ] **Step 6: Run tests and validate Compose**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: PASS.

Run: `docker compose -f apps/epaper-hub/docker-compose.yml config`

Expected: valid configuration with two services. Supply temporary `EPAPER_IMAGE`, `CUSTOMER_ORDER_IMAGE`, and `EPAPER_ENV_FILE` values if local validation needs them.

- [ ] **Step 7: Build the customer image**

Run: `docker build -f apps/customer-order/Dockerfile -t customer-order:test .`

Expected: image builds successfully.

- [ ] **Step 8: Commit**

```bash
git add apps/customer-order/Dockerfile apps/epaper-hub/docker-compose.yml apps/epaper-hub/test/deploy-config.test.js
git commit -m "Deploy customer ordering with e-paper hub"
```

---

### Task 3: Deploy Both Images Through GitHub Actions

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `apps/epaper-hub/test/deploy-config.test.js`

**Interfaces:**
- Consumes: root build context, both Dockerfiles, and server `~/restaurant-order-system.env`.
- Produces: immutable `epaper-hub:${{ github.sha }}` and `customer-order:${{ github.sha }}` images loaded and started by Compose.

- [ ] **Step 1: Add failing workflow assertions**

Assert that the workflow:

```js
assert.match(workflow, /docker build -f apps\/customer-order\/Dockerfile -t customer-order:\$\{\{ github\.sha \}\} \./);
assert.match(workflow, /docker save customer-order:\$\{\{ github\.sha \}\}/);
assert.match(workflow, /customer-order-image\.tgz/);
assert.match(workflow, /CUSTOMER_ORDER_IMAGE=customer-order:\$\{\{ github\.sha \}\}/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: FAIL because the workflow ships only `epaper-hub`.

- [ ] **Step 3: Build, save, and upload both images**

Build the hub as before and build customer-order from the repository root using `-f`. Save each image to its own gzip archive, upload both archives, load both on Lightsail, and remove both temporary archives after Compose starts.

- [ ] **Step 4: Start Compose with both immutable image tags**

Use:

```bash
EPAPER_IMAGE=epaper-hub:${{ github.sha }} \
CUSTOMER_ORDER_IMAGE=customer-order:${{ github.sha }} \
EPAPER_ENV_FILE=../restaurant-order-system.env \
docker compose up -d --no-build
```

Keep the existing cleanup command that permits only `docker-compose.yml` and `config/` inside the deployment folder.

- [ ] **Step 5: Run deployment and full tests**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: PASS.

Run: `npm test`

Expected: all repository tests PASS, with only the documented sandbox port-binding skip allowed.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy.yml apps/epaper-hub/test/deploy-config.test.js
git commit -m "Deploy customer order image in CI"
```

---

### Task 4: Update Operations And SDK Documentation

**Files:**
- Modify: `README.md`
- Modify: `apps/customer-order/README.md`
- Modify: `apps/epaper-hub/README.md`
- Modify: `infra/README.md`
- Modify: `docs/superpowers/specs/2026-07-20-sdk-table-entry-design.md`
- Modify: `docs/superpowers/plans/2026-07-20-sdk-table-entry.md`
- Modify: `apps/epaper-hub/test/deploy-config.test.js`

**Interfaces:**
- Documents: automatic 12-table reset, public ordering URL, private hub URL, server environment, two-container deployment, and Nginx routing.

- [ ] **Step 1: Write failing documentation assertions**

Assert that root and customer docs state:

```text
On every customer-order startup, tables 1 through 12 are reset to WELCOME before the HTTP listener starts.
```

Assert documentation includes `order.yeyintlwin.com`, `127.0.0.1:3100`, and `EPAPER_HUB_URL=http://epaper-hub:3000`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: FAIL on the new documentation assertions.

- [ ] **Step 3: Update documentation and project memory contract**

Replace the old statements that server startup does not reset displays. Explain that the current in-memory milestone deliberately resets all 12 displays, while persistent active-session recovery remains deferred. Document the required Nginx upstream and the external environment values without including real secrets.

Update the prior SDK entry spec and plan so they no longer contradict the approved startup behavior. This satisfies the project-level rule requiring SDK-related documentation updates when hub-side integration behavior changes.

- [ ] **Step 4: Run documentation and full tests**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: PASS.

Run: `npm test`

Expected: all tests PASS, with only the documented sandbox port-binding skip allowed.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add README.md apps/customer-order/README.md apps/epaper-hub/README.md infra/README.md docs/superpowers/specs/2026-07-20-sdk-table-entry-design.md docs/superpowers/plans/2026-07-20-sdk-table-entry.md apps/epaper-hub/test/deploy-config.test.js
git commit -m "Document automatic e-paper startup readiness"
```

---

### Task 5: Production Verification

**Files:**
- No source changes expected.

**Interfaces:**
- Verifies: GitHub Actions, Lightsail Compose services, public HTTPS, startup logs, and all 12 emulator frames.

- [ ] **Step 1: Push the completed branch and inspect GitHub Actions**

Run: `git push origin feature/startup-epaper-readiness` and inspect the exact workflow run until it completes.

Expected: test, build, upload, and Lightsail deployment steps all PASS.

- [ ] **Step 2: Verify Lightsail runtime state**

Over SSH, run:

```bash
cd ~/restaurant-order-system
docker compose ps
docker logs --tail 100 customer-order
docker logs --tail 50 epaper-hub
```

Expected: both containers are running; customer-order logs show successful initialization before the listening message; no credential values appear.

- [ ] **Step 3: Configure and verify the ordering virtual host**

Confirm DNS for `order.yeyintlwin.com` resolves to `57.180.62.148`. Configure Nginx to proxy HTTPS traffic to `127.0.0.1:3100` and obtain or renew its certificate using the server's existing certificate-management pattern.

Run:

```bash
curl -fsS https://order.yeyintlwin.com/api/health
curl -fsS https://epaper-hub.yeyintlwin.com/api/screens
```

Expected: customer health returns success and the hub reports all 12 latest frames.

- [ ] **Step 4: Verify all ordering QR destinations**

Inspect the hub API/emulator and confirm table IDs 1 through 12 show `WELCOME`, their matching table number, and distinct QR pixels generated from the corresponding URLs `https://order.yeyintlwin.com/?table=1` through `https://order.yeyintlwin.com/?table=12`.

- [ ] **Step 5: Restart customer-order and verify reset behavior**

Mark one emulator display `Table is in use`, restart only the customer-order container, and confirm all 12 displays return to `WELCOME` before `https://order.yeyintlwin.com/api/health` becomes available again.

- [ ] **Step 6: Record final evidence**

Record commit SHA, GitHub Actions run URL, container state, public endpoint status, and 12-table verification in the completion report. Do not record secret values.
