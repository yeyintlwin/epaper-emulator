# SDK-Driven Table Entry Design

## Goal

Allow an authorized restaurant system component to initialize an inactive table e-paper with its table number, `Welcome` status, and ordering QR code by calling the e-paper hub SDK from the customer-order server.

## Scope

This change adds initial/inactive-table display provisioning to `apps/customer-order`. It does not change the e-paper hub API, the SDK public API, customer menu behavior, checkout barcode behavior, table-session persistence, or session closure. A future cashier checkout/session lifecycle owns closing active sessions; this endpoint is not an active-table reset.

## Architecture

The customer-order server will expose this protected endpoint:

```http
POST /api/table-displays/:tableNumber/welcome
Authorization: Bearer <TABLE_DISPLAY_API_KEY>
```

The endpoint will validate the bearer credential and table number, reject active sessions with `409`, build the exact ordering URL from `ORDER_BASE_URL`, and call the existing e-paper SDK through the customer app's e-paper client. The server will never return or expose `TABLE_DISPLAY_API_KEY` or `EPAPER_API_KEY` to browser code.

Automatic initialization during server startup is intentionally excluded because a restart must not reset occupied tables to `Welcome`.

## Components

### Customer E-paper Client

`apps/customer-order/epaper-client.js` will expose `updateTableWelcome(tableNumber)` alongside `updateTableInUse(tableNumber)`. Both methods will use one shared SDK instance and one shared ordering-URL builder.

`updateTableWelcome(7)` will call:

```js
sdk.updateTableDisplay({
  epaperId: 7,
  tableNumber: 7,
  status: "Welcome",
  url: "https://order.yeyintlwin.com/?table=7"
});
```

### Protected Provisioning Endpoint

`apps/customer-order/server.js` will read `TABLE_DISPLAY_API_KEY` only from the server environment. The endpoint will require a constant-time bearer-token match and invoke `updateTableWelcome` only after authentication and table-number validation succeed.

The existing first-order flow will continue to call `updateTableInUse`, changing the same display to `Table is in use` while keeping the same ordering QR URL.

## Data Flow

1. An authorized admin or cashier system sends `POST /api/table-displays/7/welcome` for an inactive table with its bearer token.
2. The customer-order server validates the token and table number.
3. The server builds `ORDER_BASE_URL` with `table=7`.
4. The e-paper client calls `@restaurant/epaper-hub-sdk` server-side.
5. The SDK renders and posts the compact 296x128 frame to e-paper 7.
6. A customer scans the displayed QR and opens the existing order page for table 7.
7. The first placed order updates e-paper 7 to `Table is in use` through the same SDK client.

## Responses And Errors

- Successful provisioning returns HTTP `200` with `{ "ok": true, "tableNumber": 7, "status": "Welcome" }`.
- Missing or incorrect authorization returns HTTP `401` without calling the SDK.
- A table number outside 1 through 12 returns HTTP `400` without calling the SDK.
- An active table session returns HTTP `409` with `{ "error": "Table is in use" }` without calling the Welcome SDK update. Closing that session is owned by the future cashier checkout/session lifecycle.
- A skipped SDK call caused by missing `EPAPER_HUB_URL` or `EPAPER_API_KEY`, or a missing `TABLE_DISPLAY_API_KEY`, returns HTTP `503`.
- An e-paper hub or SDK failure returns HTTP `502` with a safe error message and does not create or modify an order session.
- The existing order endpoint keeps its current retry behavior for failed `Table is in use` updates.

## Configuration

```dotenv
EPAPER_HUB_URL=https://epaper-hub.yeyintlwin.com
EPAPER_API_KEY=replace-with-epaper-hub-api-key
ORDER_BASE_URL=https://order.yeyintlwin.com
TABLE_DISPLAY_API_KEY=replace-with-a-separate-long-random-secret
```

`TABLE_DISPLAY_API_KEY` protects access to the order-system provisioning endpoint. `EPAPER_API_KEY` remains the credential used by the SDK to update the e-paper hub.

## Testing

Automated tests will verify:

- `updateTableWelcome` sends the exact table number, `Welcome` status, and ordering URL through the SDK payload.
- Correct authorization provisions the requested display.
- Missing or incorrect authorization returns `401` and makes no SDK call.
- Invalid table numbers return `400` and make no SDK call.
- Missing display configuration returns `503`.
- SDK failures return `502` and do not create a table session.
- Existing first-order `Table is in use` behavior remains unchanged.
- A concurrent first order and Welcome provisioning leave the final display at `Table is in use`.
- `/api/config` never exposes either API key.
- Root `npm test` remains the completion gate.

## Documentation

Update the root README and customer-order README with the provisioning endpoint, required environment variable, curl example, and customer scan flow. The e-paper hub and SDK documentation do not require contract changes because their APIs remain unchanged.
