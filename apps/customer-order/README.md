# Customer Order App

Mobile-first customer ordering interface opened from the e-paper table QR code.

For now this app is English-only. Internationalization will be added after the main workflows are complete.

## Run Locally

```bash
npm ci
cp .env.example .env
npm start
```

Read table 1's QR code from the e-paper emulator at `http://localhost:3000`, then request its `/t/` path against the local port:

```text
http://localhost:3100/t/<token-from-the-table-1-QR>
```

Table QR codes always encode the production origin `https://order.yeyintlwin.com`, so copy only the 22-character token when testing locally.

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

On every customer-order startup, the service resets all 12 displays to their `Welcome` ordering screens before accepting traffic. Startup also mints a fresh visit token per table, so a restart or redeploy replaces all 12 QR URLs and invalidates every enrolled phone session. This deliberately replaces prior `Table is in use` display state in the current in-memory milestone. The protected endpoint above remains available for preparing one inactive table while the service is running; active sessions return `409` and are not reset by that endpoint.

## Table Access Contract

The QR code carries an opaque visit token and nothing else:

```text
https://order.yeyintlwin.com/t/AAAAAAAAAAAAAAAAAAAAAA
```

That path segment is exactly 22 Base64URL characters from 16 random bytes. Visit lookup is keyed solely on its SHA-256 hash; the raw token stays in private process memory (and inside `orderingUrl` on every visit snapshot) so the live QR can be re-rendered, so treat snapshots and logs as carrying a real credential. The raw token never crosses the HTTP boundary.

| Step | Contract |
| --- | --- |
| Enrollment | `GET /t/<token>` returns `302` to `/` and sets `rsid=<22 Base64URL characters>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=<seconds until expiry>` |
| Dead token | malformed, unknown, expired, or rotated all return `410` `{"error":"Table visit is no longer available"}` |
| Multiple phones | each scan of the current QR mints its own `rsid`; all phones share one visit, slip, and order list |
| Customer APIs | table comes only from `rsid`; missing or forged returns `401` `{"error":"Scan the current table QR to continue"}` |
| POST guards | `Origin: https://order.yeyintlwin.com` else `403`; `Content-Type: application/json` else `415` |
| Checkout | `POST /api/tables/{tableNumber}/checkout` with `Authorization: Bearer $CHECKOUT_API_KEY` |
| Expiry | next `06:00 Asia/Tokyo` rollover |

Checkout revokes the old QR and every enrolled phone session **before** it updates the display, so old credentials die even when the display update fails. That failure returns `502` and keeps exactly one pending replacement token, so a retry re-sends the same URL instead of minting a second QR. Replacement URLs and tokens never appear in a response body.

Accepted limitation: a photograph of the table QR taken before checkout remains usable during that active visit. Customers order over mobile data rather than a controlled Wi-Fi network, so no network signal can bind a phone to a table, and the QR is shared by every phone at the table and deliberately does not rotate mid-visit. Checkout, service startup, and the `06:00 Asia/Tokyo` rollover each invalidate it.

## Current Flow

1. Scan the table QR; the server resolves the table from the resulting `rsid` cookie.
2. Show menu categories, recommendations, search, service items, desserts, and drinks.
3. Add items to cart.
4. Place order.
5. First order creates a table session and slip number.
6. Later orders from the same table keep the same slip number.
7. First order securely updates the e-paper hub status to `Table is in use`.
8. Customer can call staff.
9. Checkout preview shows subtotal, service fee, tax, total, bill split, and a checkout barcode.
10. Protected checkout closes the active in-memory order session, revokes enrolled phones, and rotates the table QR; cashier UI integration remains future work.
