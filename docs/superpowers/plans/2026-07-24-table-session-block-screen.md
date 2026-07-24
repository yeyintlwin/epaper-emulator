# Full-Screen Block For Missing And Invalid Table Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a full-screen "scan your table QR" or "this QR is no longer valid" screen (and block ordering) whenever the customer app has no usable table session, instead of a small overlay message or raw `410` JSON.

**Architecture:** The server stops returning `410` JSON for a dead `/t/<token>` and instead `302`-redirects to `/?e=expired`. The single-page app gains one full-screen block element with two messages, chosen by a `reason` (`missing` when there was never a session, `invalid` when a token is dead or a session was revoked). Nothing else about enrollment, ordering, checkout, or the e-paper integration changes.

**Tech Stack:** Node.js 20, CommonJS, native `node:http`, `node:test`, vanilla browser JS/CSS, no new dependencies.

**Branch:** Work happens on `feature/session-block-screen` (already checked out). Do not push to `main` — pushing triggers an automatic production deploy; the branch is merged separately after review.

---

### Task 1: Redirect dead tokens to `/?e=expired`

**Files:**
- Modify: `apps/customer-order/server.js` (the `GET /t/:token` dead-token branch, around line 231-233)
- Modify: `apps/customer-order/test/server.test.js` (one dead-token test plus four old-token assertions inside checkout/rollover tests)

- [ ] **Step 1: Rewrite the main dead-token test to expect the redirect**

Replace the whole test at `apps/customer-order/test/server.test.js:78-102` (`"malformed, unknown, expired, and superseded QR tokens have one 410 response"`) with:

```js
test("malformed, unknown, expired, and superseded QR tokens all redirect to the expired screen", async () => {
  let now = new Date("2026-07-22T20:59:59Z");
  const expiredStore = createVisitStore({ now: () => now });
  const expiredToken = expiredStore.getRawTokenForDisplay(7);
  now = new Date("2026-07-22T21:00:00Z");

  const supersededStore = createVisitStore();
  const supersededToken = supersededStore.getRawTokenForDisplay(7);
  supersededStore.beginRotation(7);

  const cases = [
    { server: createServer(), token: "malformed" },
    { server: createServer(), token: "A".repeat(22) },
    { server: createCustomerServer({ visitStore: expiredStore }), token: expiredToken },
    { server: createCustomerServer({ visitStore: supersededStore }), token: supersededToken }
  ];
  const responses = [];
  for (const entry of cases) responses.push(await entry.server.inject("GET", `/t/${entry.token}`));

  for (const response of responses) {
    assert.equal(response.status, 302);
    assert.equal(response.headers.Location, "/?e=expired");
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(response.headers["Set-Cookie"], undefined);
  }
  for (let index = 0; index < responses.length; index += 1) {
    assert.doesNotMatch(JSON.stringify(responses[index]), new RegExp(cases[index].token));
  }
});
```

- [ ] **Step 2: Update the four old-token assertions in the checkout/rollover tests**

At `apps/customer-order/test/server.test.js:317`, replace:

```js
  assert.equal((await server.inject("GET", `/t/${oldToken}`)).status, 410);
```

with:

```js
  const expiredScan = await server.inject("GET", `/t/${oldToken}`);
  assert.equal(expiredScan.status, 302);
  assert.equal(expiredScan.headers.Location, "/?e=expired");
```

At `apps/customer-order/test/server.test.js:377`, replace:

```js
  assert.equal((await server.inject("GET", `/t/${oldToken}`)).status, 410);
```

with:

```js
  const expiredScan = await server.inject("GET", `/t/${oldToken}`);
  assert.equal(expiredScan.status, 302);
  assert.equal(expiredScan.headers.Location, "/?e=expired");
```

At `apps/customer-order/test/server.test.js:994`, replace:

```js
  assert.equal(oldQr.status, 410);
```

with:

```js
  assert.equal(oldQr.status, 302);
  assert.equal(oldQr.headers.Location, "/?e=expired");
```

At `apps/customer-order/test/server.test.js:1139`, replace:

```js
  assert.equal(oldQr.status, 410);
```

with:

```js
  assert.equal(oldQr.status, 302);
  assert.equal(oldQr.headers.Location, "/?e=expired");
```

- [ ] **Step 3: Run the server tests and verify RED**

Run: `npm --prefix apps/customer-order test -- test/server.test.js`

Expected: FAIL — the redirect assertions expect `302`/`/?e=expired` but the code still returns `410`.

- [ ] **Step 4: Change the server dead-token branch to a redirect**

In `apps/customer-order/server.js`, replace:

```js
        const enrollment = visitStore.enroll(enrollmentRoute[1]);
        if (!enrollment) {
          return sendJson(res, 410, { error: "Table visit is no longer available" });
        }
```

with:

```js
        const enrollment = visitStore.enroll(enrollmentRoute[1]);
        if (!enrollment) {
          res.writeHead(302, {
            Location: "/?e=expired",
            "Cache-Control": "no-store"
          });
          return res.end();
        }
```

- [ ] **Step 5: Run the server tests and verify GREEN**

Run: `npm --prefix apps/customer-order test -- test/server.test.js`

Expected: PASS — all server tests, including the rewritten dead-token test and the four updated checkout/rollover assertions.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-order/server.js apps/customer-order/test/server.test.js
git commit -m "Redirect dead table QR tokens to the expired screen"
```

---

### Task 2: Full-screen block UI

**Files:**
- Modify: `apps/customer-order/public/index.html` (remove `#rescanMessage`, add `#blockScreen`)
- Modify: `apps/customer-order/public/styles.css` (add the `blocked` state rules)
- Modify: `apps/customer-order/public/app.js` (add `showBlockScreen`, remove `requireRescan`, wire boot + `api()`)
- Modify: `apps/customer-order/test/public-ui.test.js` (assert the new markup and script)

Note: the UI test is a static source-analysis test (it reads the files and matches strings) — this is the existing convention in this repo; there is no browser/DOM harness and none should be added.

- [ ] **Step 1: Update the public-UI assertions**

In `apps/customer-order/test/public-ui.test.js`, replace this block (currently lines 45-52):

```js
  assert.match(html, /id="rescanMessage"[^>]*hidden/);
  assert.match(html, /Scan the current table QR to continue/);
  assert.match(js, /api\("\/api\/session"\)/);
  assert.match(js, /sessionResult\.session\.tableNumber/);
  assert.match(js, /classList\.add\("rescanRequired"\)/);
  assert.match(js, /response\.status === 401 \|\| response\.status === 410/);
  assert.doesNotMatch(js, /getTableNumber|table_number|api\(`\/api\/session\?/);
  assert.doesNotMatch(`${html}\n${css}\n${js}`, /EPAPER_API_KEY|TABLE_DISPLAY_API_KEY|CHECKOUT_API_KEY|API_KEY|Bearer/);
```

with:

```js
  assert.match(html, /id="blockScreen"/);
  assert.match(html, /id="blockHeading"/);
  assert.match(html, /id="blockMessage"/);
  assert.doesNotMatch(html, /id="rescanMessage"/);
  assert.match(js, /Scan your table's QR code to start ordering\./);
  assert.match(js, /This QR code is no longer valid\. Scan the current QR code at your table\./);
  assert.match(js, /function showBlockScreen/);
  assert.match(js, /params\.get\("e"\) === "expired"/);
  assert.match(js, /showBlockScreen\(state\.session \? "invalid" : "missing"\)/);
  assert.doesNotMatch(js, /requireRescan|rescanRequired/);
  assert.match(css, /\.blocked\s+\.appShell/);
  assert.match(css, /\.blockScreen/);
  assert.match(js, /api\("\/api\/session"\)/);
  assert.match(js, /sessionResult\.session\.tableNumber/);
  assert.match(js, /response\.status === 401 \|\| response\.status === 410/);
  assert.doesNotMatch(js, /getTableNumber|table_number|api\(`\/api\/session\?/);
  assert.doesNotMatch(`${html}\n${css}\n${js}`, /EPAPER_API_KEY|TABLE_DISPLAY_API_KEY|CHECKOUT_API_KEY|API_KEY|Bearer/);
```

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npm --prefix apps/customer-order test -- test/public-ui.test.js`

Expected: FAIL — `#blockScreen`, `showBlockScreen`, the new messages, and the `.blocked` CSS do not exist yet.

- [ ] **Step 3: Replace the rescan panel with a block screen in `index.html`**

In `apps/customer-order/public/index.html`, delete this block (currently lines 27-29):

```html
      <section class="statusPanel" id="rescanMessage" hidden>
        Scan the current table QR to continue
      </section>
```

Then add the block screen immediately after the closing `</main>` tag (currently line 94), before `<div class="drawerBackdrop" ...>`:

```html
    <section class="blockScreen" id="blockScreen" role="alertdialog" aria-live="assertive">
      <svg class="blockIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm11-2h5v2h-5v-2Zm3 4h2v4h-6v-2h4v-2Zm-6 0h2v6h-2v-6Z"/></svg>
      <h2 class="blockHeading" id="blockHeading"></h2>
      <p class="blockMessage" id="blockMessage"></p>
    </section>
```

- [ ] **Step 4: Add the `blocked` state styles in `styles.css`**

Append to `apps/customer-order/public/styles.css`:

```css
.blockScreen {
  display: none;
}

.blocked .appShell,
.blocked .bottomNav,
.blocked .categoryDrawer,
.blocked .drawerBackdrop {
  display: none;
}

.blocked .blockScreen {
  display: flex;
  position: fixed;
  inset: 0;
  z-index: 20;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  text-align: center;
  background: var(--bg);
  color: var(--ink);
}

.blockIcon {
  width: 64px;
  height: 64px;
  fill: var(--accent);
}

.blockHeading {
  margin: 0;
  font-size: 22px;
}

.blockMessage {
  margin: 0;
  max-width: 320px;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.5;
}
```

- [ ] **Step 5: Add `showBlockScreen`, remove `requireRescan`, and wire the boot in `app.js`**

In `apps/customer-order/public/app.js`:

(a) Remove the `rescanRequired` field from `state` — delete the line `  rescanRequired: false` (currently line 8), and remove the trailing comma issue by ensuring the line above it (`  session: null,`) keeps its comma but is now the last field. The `state` object becomes:

```js
const state = {
  tableNumber: null,
  menu: { tabs: [], items: [] },
  activeTab: "Recommended",
  activeView: "menu",
  cart: new Map(),
  session: null
};
```

(b) Replace the `requireRescan` function (currently lines 28-34):

```js
function requireRescan() {
  state.rescanRequired = true;
  document.documentElement.classList.add("rescanRequired");
  $("#rescanMessage").hidden = false;
  document.querySelectorAll("[data-inc], [data-dec], #placeOrderButton, #callStaffButton")
    .forEach((button) => { button.disabled = true; });
}
```

with:

```js
const blockMessages = {
  missing: {
    heading: "Scan to order",
    message: "Scan your table's QR code to start ordering."
  },
  invalid: {
    heading: "QR no longer valid",
    message: "This QR code is no longer valid. Scan the current QR code at your table."
  }
};

function showBlockScreen(reason) {
  const copy = blockMessages[reason] || blockMessages.missing;
  $("#blockHeading").textContent = copy.heading;
  $("#blockMessage").textContent = copy.message;
  document.documentElement.classList.add("blocked");
}
```

(c) In the `api` helper, replace the 401/410 branch (currently line 43):

```js
    if (response.status === 401 || response.status === 410) requireRescan();
```

with:

```js
    if (response.status === 401 || response.status === 410) {
      showBlockScreen(state.session ? "invalid" : "missing");
    }
```

(d) Replace the final boot line (currently line 248):

```js
init().catch((error) => showToast(error.message));
```

with:

```js
const params = new URLSearchParams(window.location.search);
if (params.get("e") === "expired") {
  showBlockScreen("invalid");
} else {
  init().catch((error) => {
    if (!document.documentElement.classList.contains("blocked")) showToast(error.message);
  });
}
```

This keeps a genuine error toast (for example a failed `/api/menu`) but suppresses the redundant toast when `init()` already showed the block screen.

- [ ] **Step 6: Run the UI test and verify GREEN**

Run: `npm --prefix apps/customer-order test -- test/public-ui.test.js`

Expected: PASS.

- [ ] **Step 7: Run the whole customer-order suite**

Run: `npm --prefix apps/customer-order test`

Expected: PASS — all customer-order tests.

- [ ] **Step 8: Commit**

```bash
git add apps/customer-order/public/index.html apps/customer-order/public/styles.css apps/customer-order/public/app.js apps/customer-order/test/public-ui.test.js
git commit -m "Show a full-screen block for missing and invalid table sessions"
```

---

### Task 3: Update documentation and the lifecycle assertions

**Files:**
- Modify: `apps/epaper-hub/test/deploy-config.test.js` (two lifecycle assertions)
- Modify: `README.md` (the enrollment bullet in "Secure Table QR Lifecycle")
- Modify: `apps/customer-order/README.md` (the "Dead token" row in "Table Access Contract")

- [ ] **Step 1: Update the lifecycle assertions**

In `apps/epaper-hub/test/deploy-config.test.js`, inside the test `"lifecycle docs describe QR enrollment, multi-phone sessions, and checkout revocation"`, delete this line:

```js
  assert.match(lifecycle, /Table visit is no longer available/);
```

and replace this line:

```js
  assert.match(lifecycle, /\b410\b/);
```

with:

```js
  assert.match(lifecycle, /\/\?e=expired/);
```

- [ ] **Step 2: Run the deploy-config test and verify RED**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: FAIL — the docs do not yet mention `/?e=expired`.

- [ ] **Step 3: Update the enrollment bullet in `README.md`**

In `README.md`, replace:

```markdown
- **Enrollment.** `GET /t/<token>` answers `302` to `/` and sets `rsid=<22 Base64URL characters>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=<seconds until expiry>`. A token that is malformed, unknown, expired, or already rotated returns `410` with `{"error":"Table visit is no longer available"}` — the four cases are indistinguishable to the client.
```

with:

```markdown
- **Enrollment.** `GET /t/<token>` answers `302` to `/` and sets `rsid=<22 Base64URL characters>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=<seconds until expiry>`. A token that is malformed, unknown, expired, or already rotated instead redirects (`302`) to `/?e=expired`, which renders a full-screen "This QR code is no longer valid. Scan the current QR code at your table." screen and blocks ordering — the four cases are indistinguishable to the client. Opening the app with no session at all (`/` with no cookie) renders a full-screen "Scan your table's QR code to start ordering." screen.
```

- [ ] **Step 4: Update the "Dead token" row in `apps/customer-order/README.md`**

In `apps/customer-order/README.md`, replace:

```markdown
| Dead token | malformed, unknown, expired, or rotated all return `410` `{"error":"Table visit is no longer available"}` |
```

with:

```markdown
| Dead token | malformed, unknown, expired, or rotated all `302`-redirect to `/?e=expired`, which shows a full-screen "This QR code is no longer valid" block and disables ordering |
```

- [ ] **Step 5: Run the deploy-config test and verify GREEN**

Run: `npm --prefix apps/epaper-hub test -- test/deploy-config.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md apps/customer-order/README.md apps/epaper-hub/test/deploy-config.test.js
git commit -m "Document the expired-QR redirect and block screens"
```

---

### Task 4: Full verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS — all three packages (`epaper-hub-sdk`, `epaper-hub`, `customer-order`) green.

- [ ] **Step 2: Whitespace check**

Run: `git diff --check origin/main`

Expected: no output.

- [ ] **Step 3: Confirm the branch is ready**

Run: `git log --oneline main..HEAD`

Expected: the three feature commits (redirect, block UI, docs) plus the earlier design-spec commit. The branch is ready to merge to `main`; merging and the production deploy are done separately, after review, per the project's push-to-deploy pipeline.
