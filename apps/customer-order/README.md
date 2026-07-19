# Customer Order App

Mobile-first customer ordering interface opened from the e-paper table QR code.

For now this app is English-only. Internationalization will be added after the main workflows are complete.

## Run Locally

```bash
cp .env.example .env
npm start
```

Open `http://localhost:3100/?table=1`.

## Environment

```bash
PORT=3100
EPAPER_HUB_URL=https://epaper-hub.yeyintlwin.com
EPAPER_API_KEY=replace-with-epaper-hub-api-key
```

`EPAPER_API_KEY` stays on the server. The browser never receives it. If you already have the e-paper hub secret as `API_KEY`, the customer app can reuse that instead.

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
