# Restaurant Management System

Restaurant ordering platform with table e-paper monitors, customer ordering, kitchen order display, cashier checkout, and admin management.

## Apps

- `apps/epaper-hub` - running e-paper emulator and secure update API for 12 table monitors.
- `apps/customer-order` - customer phone ordering flow after scanning the table QR code.
- `apps/kitchen-display` - kitchen monitor for incoming orders and preparation status.
- `apps/cashier-counter` - checkout, bill review, payment QR, and final settlement.
- `apps/admin-management` - menu management, pricing, daily sales, and transaction history.
- `apps/captive-portal` - guest Wi-Fi onboarding and survey flow.
- `packages/shared` - shared schemas and helpers used across apps.
- `infra` - deployment and infrastructure notes.

## Current Status

The first working service is the e-paper hub at `apps/epaper-hub`. It is deployed at `https://epaper-hub.yeyintlwin.com` and still uses the same GitHub Actions CI/CD pipeline.

Run the current app locally:

```bash
cd apps/epaper-hub
cp .env.example .env
npm install
npm start
```

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
9. The first order creates the slip number. All later orders from the same table session keep that same slip number until checkout.
10. The cashier completes checkout and closes the table session.

## Management Requirements

The admin interface must support menu item management, price changes, daily sales reports, and full transaction history.

## Deployment Shape

The Lightsail server should keep only the runtime deployment files in `~/epaper-emulator`:

- `docker-compose.yml`
- optional `config/`

The environment file remains outside that folder at `~/epaper-emulator.env`.
