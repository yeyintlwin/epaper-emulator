# Restaurant Management System

Restaurant ordering platform with table e-paper monitors, customer ordering, kitchen order display, cashier checkout, and admin management.

## Apps

- `apps/epaper-hub` - running e-paper emulator and secure update API for 12 table monitors.
- `apps/customer-order` - customer phone ordering flow after scanning the table QR code.
- `apps/kitchen-display` - kitchen monitor for incoming orders and preparation status.
- `apps/cashier-counter` - checkout, bill review, checkout barcode scanning, and final settlement.
- `apps/admin-management` - menu management, pricing, daily sales, and transaction history.
- `apps/captive-portal` - guest Wi-Fi onboarding and survey flow.
- `packages/epaper-hub-sdk` - server-side SDK that renders table/status/QR templates and securely updates e-paper screens.
- `packages/shared` - shared schemas and helpers used across apps.
- `infra` - deployment and infrastructure notes.

## Current Status

The first deployed service is the e-paper hub at `apps/epaper-hub`. It is deployed at `https://epaper-hub.yeyintlwin.com` and still uses the same GitHub Actions CI/CD pipeline.

The customer ordering app lives at `apps/customer-order` and is deployed at `https://order.yeyintlwin.com`.

Run the current app locally:

```bash
cd apps/epaper-hub
cp .env.example .env
npm install
npm start
```

Run the customer ordering app locally:

```bash
cd apps/customer-order
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:3100/?table=1`.

Applications can update a table display through the SDK:

```js
const { createEpaperHubSdk } = require("./packages/epaper-hub-sdk");

const epaper = createEpaperHubSdk({
  baseUrl: "https://epaper-hub.yeyintlwin.com",
  apiKey: process.env.EPAPER_API_KEY
});

await epaper.updateTableDisplay({
  epaperId: 3,
  tableNumber: 3,
  status: "Welcome",
  url: "https://order.yeyintlwin.com/?table=3"
});
```

Keep this call on the server so `EPAPER_API_KEY` is never exposed to customers. `TABLE_DISPLAY_API_KEY` is a separate server-only credential for the customer-order provisioning endpoint; it is not the e-paper hub `EPAPER_API_KEY` or its `API_KEY` fallback.

Initialize a table display through the customer-order service:

```bash
curl -X POST "https://order.yeyintlwin.com/api/table-displays/7/welcome" \
  -H "Authorization: Bearer $TABLE_DISPLAY_API_KEY"
```

This securely uses the server-side e-paper SDK to display table 7, `Welcome`, and a QR for `https://order.yeyintlwin.com/?table=7`. On every customer-order startup, the service resets all 12 displays to their `Welcome` ordering screens before accepting traffic. Use this endpoint only to prepare an inactive table while the service is running. Active tables return `409` with `Table is in use` and are not reset by this endpoint. The protected checkout operation closes the in-memory order session, revokes the table visit, and renders a fresh `Welcome` QR.

Run tests from the repository root:

```bash
npm test
```

## Core Flow

1. Each restaurant table has an e-paper monitor showing table number, status, and a QR code.
2. Initial table status is `Welcome`.
3. The customer scans the QR code and opens the ordering page with the table number in the URL.
4. The customer selects a language: Thai, English, Chinese, Japanese, or Burmese.
5. The customer adds menu items to the cart and places an order.
6. When the first order is placed, the table status updates to `Table is in use`.
7. The kitchen monitor receives the order with the table number.
8. The kitchen printer prints a slip with table number, ordered items, slip number, and barcode.
9. The first order creates the slip number. All later orders from the same table session keep that same slip number while the session remains active.
10. Protected checkout closes the current in-memory order session and rotates the table QR; cashier workflow integration remains future work.

## Management Requirements

The admin interface must support menu item management, price changes, daily sales reports, and full transaction history.

## Deployment Shape

The Lightsail server should keep only the runtime deployment files in `~/restaurant-order-system`:

- `docker-compose.yml`
- optional `config/`

The environment file remains outside that folder at `~/restaurant-order-system.env`.

Customer-order production startup requires these values. Keep `SHOP_ID` and `CHECKOUT_API_KEY` in the external production environment file; Compose supplies the two non-secret business-time defaults.

```dotenv
SHOP_ID=1
CHECKOUT_API_KEY=<independent-random-secret>
BUSINESS_TIME_ZONE=Asia/Tokyo
BUSINESS_DAY_ROLLOVER_HOUR=6
```

Docker Compose runs `epaper-hub` and `customer-order` together. The hub and order ports bind only to `127.0.0.1`; Nginx owns public HTTPS. The order service waits for the hub health check, then connects to it privately at `http://epaper-hub:3000` while rendering public QR links for `https://order.yeyintlwin.com`.
