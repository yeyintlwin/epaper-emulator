# Infrastructure

Deployment and infrastructure notes for the restaurant management system.

Production services:

- E-paper hub: `https://epaper-hub.yeyintlwin.com`
- Customer ordering: `https://order.yeyintlwin.com`
- Host: AWS Lightsail Ubuntu
- Runtime: Docker Compose

The deployed project folder is `~/restaurant-order-system`. It should contain only `docker-compose.yml` and optional `config/`. Runtime secrets stay in `~/restaurant-order-system.env`.

Docker publishes the hub at `127.0.0.1:3000` and customer ordering at `127.0.0.1:3100`; Nginx terminates HTTPS for both subdomains. Inside Compose, customer ordering uses `EPAPER_HUB_URL=http://epaper-hub:3000`. On every customer-order startup, tables 1 through 12 are reset to `WELCOME` before port 3100 begins accepting traffic.

## Secure Table QR Runtime Values

Customer-order refuses to start unless these are present, so add them to `~/restaurant-order-system.env` **before** deploying the secure-QR release. `SHOP_ID` must be exactly `1`, `BUSINESS_TIME_ZONE` exactly `Asia/Tokyo`, and `BUSINESS_DAY_ROLLOVER_HOUR` exactly `6`; any other value aborts startup before the service listens.

```dotenv
SHOP_ID=1
CHECKOUT_API_KEY=<independent-random-secret>
BUSINESS_TIME_ZONE=Asia/Tokyo
BUSINESS_DAY_ROLLOVER_HOUR=6
```

Compose supplies `BUSINESS_TIME_ZONE` and `BUSINESS_DAY_ROLLOVER_HOUR` as non-secret defaults. `SHOP_ID` and `CHECKOUT_API_KEY` must come from the external runtime environment file, which stays outside the deploy folder at mode `600`.

`CHECKOUT_API_KEY` is an independent 32-byte secret — not `TABLE_DISPLAY_API_KEY` and not the hub's `EPAPER_API_KEY`. It authorizes the server-to-server route `POST /api/tables/{tableNumber}/checkout`, which revokes a table's QR and all enrolled phone sessions and then renders a replacement `Welcome` QR.

Each table display shows an opaque visit URL, `https://order.yeyintlwin.com/t/AAAAAAAAAAAAAAAAAAAAAA`, whose trailing 22 Base64URL characters are the table's only credential. Visits expire at the next `06:00 Asia/Tokyo` rollover, when a scheduled reconciliation rotates every expired table to a fresh `Welcome` QR. Never log or echo raw tokens, `rsid` cookies, or `CHECKOUT_API_KEY`.
