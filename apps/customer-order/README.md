# Customer Order App

Mobile-first customer ordering interface opened from the e-paper table QR code.

For now this app is English-only. Internationalization will be added after the main workflows are complete.

## Run Locally

```bash
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:3100/?table=1`.

For direct local processes outside Docker, set `EPAPER_HUB_URL=http://localhost:3000`. Compose overrides it with the private service address shown below.

## Environment

```bash
PORT=3100
EPAPER_HUB_URL=http://epaper-hub:3000
ORDER_BASE_URL=https://order.yeyintlwin.com
SHOP_ID=1
CHECKOUT_API_KEY=<independent-random-secret>
BUSINESS_TIME_ZONE=Asia/Tokyo
BUSINESS_DAY_ROLLOVER_HOUR=6
EPAPER_API_KEY=replace-with-epaper-hub-api-key
TABLE_DISPLAY_API_KEY=replace-with-a-separate-long-random-secret
```

`CHECKOUT_API_KEY`, `TABLE_DISPLAY_API_KEY`, `EPAPER_API_KEY`, and the `API_KEY` fallback are server-only credentials and are never exposed to browser code. `ORDER_BASE_URL` is the public page encoded into each table QR code. Production deployment reads `SHOP_ID` and `CHECKOUT_API_KEY` from the external runtime environment file at `~/restaurant-order-system.env`; Compose supplies the exact `BUSINESS_TIME_ZONE` and `BUSINESS_DAY_ROLLOVER_HOUR` defaults.

## Initialize A Table Display

```bash
curl -X POST "http://localhost:3100/api/table-displays/7/welcome" \
  -H "Authorization: Bearer $TABLE_DISPLAY_API_KEY"
```

On every customer-order startup, the service resets all 12 displays to their `Welcome` ordering screens before accepting traffic. This deliberately replaces prior `Table is in use` display state in the current in-memory milestone. The protected endpoint above remains available for preparing one inactive table while the service is running; active sessions return `409` and are not reset by that endpoint.

## Current Flow

1. Read `table` or `table_number` from the QR URL.
2. Show menu categories, recommendations, search, service items, desserts, and drinks.
3. Add items to cart.
4. Place order.
5. First order creates a table session and slip number.
6. Later orders from the same table keep the same slip number.
7. First order securely updates the e-paper hub status to `Table is in use`.
8. Customer can call staff.
9. Checkout preview shows subtotal, service fee, tax, total, bill split, and a checkout barcode.
10. Protected checkout closes the active in-memory order session, revokes enrolled phones, and rotates the table QR; cashier UI integration remains future work.
