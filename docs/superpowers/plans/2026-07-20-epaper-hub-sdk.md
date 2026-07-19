# E-paper Hub SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-side JavaScript SDK that renders a table status template with a QR code, encodes it as `epd-2bit-v1`, and securely updates a selected e-paper screen.

**Architecture:** The SDK lives in `packages/epaper-hub-sdk` and exposes one factory plus one renderer. It reuses the hub's compact 296x128 three-color wire format, renders QR modules with the small `qrcode-generator` package, and is consumed by the customer-order server wrapper so the API key never reaches browser code.

**Tech Stack:** Node.js 20, CommonJS, `node:test`, `qrcode-generator`, native `fetch`.

## Global Constraints

- Screens are exactly 296x128 pixels and support only white, black, and red.
- API payloads use the compact `epd-2bit-v1` format.
- E-paper IDs are integers from 1 through 12.
- Authentication uses `Authorization: Bearer <EPAPER_API_KEY>` from server-side environment configuration.
- Checkout continues to use a barcode; the SDK QR code is only for the table ordering URL.

---

### Task 1: SDK renderer and compact codec

**Files:**
- Create: `packages/epaper-hub-sdk/package.json`
- Create: `packages/epaper-hub-sdk/codec.js`
- Create: `packages/epaper-hub-sdk/table-template.js`
- Test: `packages/epaper-hub-sdk/test/table-template.test.js`

**Interfaces:**
- Produces: `renderTableDisplay({ tableNumber, status, url }) -> { format, width, height, data }`
- Produces: `decodePackedBase64(payload) -> string[128]`

- [x] **Step 1: Write the failing renderer test**

Assert that rendering table 7 returns `epd-2bit-v1`, dimensions 296x128, exactly 9,472 packed bytes after base64 decoding, and decoded rows containing black and red pixels.

- [x] **Step 2: Run the test to verify it fails**

Run: `npm --prefix packages/epaper-hub-sdk test`
Expected: FAIL because `table-template.js` does not exist.

- [x] **Step 3: Implement the minimum renderer**

Reuse the hub codec logic, a compact bitmap font, and `qrcode-generator` to draw the border, table number, status, and exact URL as a QR matrix.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm --prefix packages/epaper-hub-sdk test`
Expected: PASS.

### Task 2: Authenticated SDK client

**Files:**
- Create: `packages/epaper-hub-sdk/index.js`
- Test: `packages/epaper-hub-sdk/test/client.test.js`

**Interfaces:**
- Produces: `createEpaperHubSdk({ baseUrl, apiKey, fetchImpl })`
- Produces: `sdk.updateTableDisplay({ epaperId, tableNumber, status, url })`
- Produces: `sdk.renderTableDisplay({ tableNumber, status, url })`

- [x] **Step 1: Write failing client tests**

Assert the exact endpoint, bearer header, compact JSON payload, response handling, e-paper ID validation, required API key, and HTTP error reporting.

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix packages/epaper-hub-sdk test`
Expected: FAIL because `index.js` does not exist.

- [x] **Step 3: Implement the minimum client**

Normalize the base URL, validate IDs and credentials, render the table template, and POST it with native `fetch`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm --prefix packages/epaper-hub-sdk test`
Expected: PASS.

### Task 3: Customer app integration and documentation

**Files:**
- Modify: `apps/customer-order/epaper-client.js`
- Modify: `apps/customer-order/server.js`
- Modify: `apps/customer-order/test/epaper-client.test.js`
- Modify: `apps/customer-order/.env.example`
- Create: `packages/epaper-hub-sdk/README.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `.github/workflows/deploy.yml`
- Modify: `apps/epaper-hub/test/deploy-config.test.js`

**Interfaces:**
- Consumes: `createEpaperHubSdk` and `updateTableDisplay`
- Produces: First customer order updates the table's e-paper with status `Table is in use` and its ordering URL.

- [x] **Step 1: Update the integration tests first**

Assert the customer wrapper sends a compact payload containing the configured table ordering URL, and assert CI runs the SDK test suite.

- [x] **Step 2: Run affected tests to verify they fail**

Run: `npm --prefix apps/customer-order test && npm --prefix apps/epaper-hub test`
Expected: FAIL because the wrapper and workflow do not use the SDK yet.

- [x] **Step 3: Integrate and document**

Replace the customer's legacy text payload with the SDK call, add `ORDER_BASE_URL`, document SDK setup and usage, and include SDK tests in root and CI commands.

- [x] **Step 4: Verify all tests**

Run: `npm test`
Expected: all SDK, hub, and customer tests pass.
