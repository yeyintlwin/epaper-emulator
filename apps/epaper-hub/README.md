# E-paper Emulator

Web application and API emulator for 12 e-paper displays. Each display has a fixed 296x128 pixel canvas and supports white, black, and red.

The web UI is a realtime viewer for the 12 screens. Pixel updates are sent through the API.

## Run Locally

```bash
cd apps/epaper-hub
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000`.

API documentation is available at `http://localhost:3000/api/docs`.

## Docker

```bash
cd ../..
docker build -f apps/customer-order/Dockerfile -t customer-order .
EPAPER_ENV_FILE=/path/to/restaurant-order-system.env \
  docker compose -f apps/epaper-hub/docker-compose.yml up -d --build
```

Compose starts the customer-order service after `/health` reports that the e-paper hub is ready. Customer ordering uses the private Docker URL `http://epaper-hub:3000`, publishes `127.0.0.1:3100`, and resets all 12 display screens before accepting traffic. Latest e-paper screen state is persisted in the Docker named volume `epaper-data`, so browser refreshes and container restarts keep the last update.

## Secure Update API

Open `/api/docs` in the running app for the endpoint reference.

Use either `Authorization: Bearer <API_KEY>` or `x-api-key: <API_KEY>`.

### Compact Pixel Format

For real devices, use `epd-2bit-v1`. It packs each pixel into 2 bits:

- `00` = white
- `01` = black
- `10` = red

A full 296x128 frame is 9,472 bytes before base64 encoding.

```json
{
  "format": "epd-2bit-v1",
  "width": 296,
  "height": 128,
  "data": "base64-packed-bytes"
}
```

Update by path:

```bash
curl -X POST http://SERVER_IP:3000/api/epapers/1 \
  -H "Authorization: Bearer replace-with-a-long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "epd-2bit-v1",
    "width": 296,
    "height": 128,
    "data": "base64-packed-bytes"
  }'
```

Update by body:

```bash
curl -X POST http://SERVER_IP:3000/api/update \
  -H "x-api-key: replace-with-a-long-random-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 2,
    "data": {
      "format": "epd-2bit-v1",
      "width": 296,
      "height": 128,
      "data": "base64-packed-bytes"
    }
  }'
```

The demo script uses this compact format automatically. The server still accepts the older debug formats, `bitmap` rows and `pixels`, for manual testing.

Send 12 demo screens with different icon-style pixel art:

```bash
cd apps/epaper-hub
EPAPER_URL=https://epaper-hub.yeyintlwin.com API_KEY=your-key npm run demo
```

Older debug pixel payload:

```json
{
  "id": 3,
  "data": {
    "pixels": [
      { "x": 10, "y": 10, "color": "black" },
      { "x": 11, "y": 10, "color": "red" }
    ]
  }
}
```

## AWS Lightsail Ubuntu

1. Install Docker and Docker Compose.
2. Keep runtime config outside the deploy folder at `~/restaurant-order-system.env`.
3. Keep only `~/restaurant-order-system/docker-compose.yml` on the server, plus `~/restaurant-order-system/config/` if needed later.
4. Build and upload both images before running `docker compose up -d --no-build`; the current GitHub Actions update for the customer-order image is the next deployment task.
5. The latest screen state is stored inside the Docker named volume `epaper-data`, not in the project folder.
6. Open ports `80` and `443` in the Lightsail firewall.

Run the hub on `127.0.0.1:3000` and proxy `epaper-hub.yeyintlwin.com` to it with Nginx. Run customer ordering on `127.0.0.1:3100` and proxy `order.yeyintlwin.com` to it with Nginx.
