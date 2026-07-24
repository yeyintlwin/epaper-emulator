# E-paper Hub SDK

Server-side JavaScript SDK for the restaurant's 296x128 white/black/red table displays. Its built-in table template renders the table number, status, and a QR code for the exact ordering URL, then sends the compact `epd-2bit-v1` payload to the hub.

## Install

From this monorepo:

```bash
npm --prefix packages/epaper-hub-sdk ci
```

## Use

```js
const { createEpaperHubSdk } = require("@restaurant/epaper-hub-sdk");

const epaper = createEpaperHubSdk({
  baseUrl: process.env.EPAPER_HUB_URL,
  apiKey: process.env.EPAPER_API_KEY
});

await epaper.updateTableDisplay({
  epaperId: 7,
  tableNumber: 7,
  status: "Table is in use",
  url: "https://order.yeyintlwin.com/t/EXAMPLEtokenEXAMPLEtok"
});
```

`epaperId` must be from 1 to 12. `tableNumber`, `status`, and `url` are rendered into the built-in template. The URL is encoded as a QR code without modification and is rejected if its QR matrix cannot fit the screen safely. Callers pass the exact ordering URL; the SDK never builds one. In production that URL is the table's opaque visit URL, `https://order.yeyintlwin.com/t/` followed by 22 Base64URL characters, which the customer-order service rotates at checkout, on every service start, and at the `06:00 Asia/Tokyo` business rollover. The current status font supports uppercase ASCII letters, digits, spaces, and hyphens across two 15-character lines.

To render without sending:

```js
const payload = epaper.renderTableDisplay({
  tableNumber: 7,
  status: "Welcome",
  url: "https://order.yeyintlwin.com/t/EXAMPLEtokenEXAMPLEtok"
});
```

The returned object can be posted directly to `/api/epapers/:id`. Keep the API key and SDK calls in server code only.

## Docker Runtime

The customer-order container uses this SDK through the private Compose address `http://epaper-hub:3000`, not the public e-paper hub URL. Its startup bootstrap uses the same server-side client to reset tables 1 through 12 to `Welcome` before customer traffic is accepted. Keep `EPAPER_API_KEY` (or the hub's `API_KEY` fallback) only in the external runtime environment file.

The same external runtime environment file must provide the customer-order production values below. Compose supplies the non-secret timezone and rollover defaults, while `SHOP_ID` and `CHECKOUT_API_KEY` remain in that file.

```dotenv
SHOP_ID=1
CHECKOUT_API_KEY=<independent-random-secret>
BUSINESS_TIME_ZONE=Asia/Tokyo
BUSINESS_DAY_ROLLOVER_HOUR=6
```
