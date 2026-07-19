# E-paper Emulator

Web application and API emulator for 12 e-paper displays. Each display has a fixed 296x128 pixel canvas and supports white, black, and red.

The web UI is a realtime viewer for the 12 screens. Pixel updates are sent through the API.

## Run Locally

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000`.

API documentation is available at `http://localhost:3000/api/docs`.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

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
2. Keep runtime config outside the deploy folder at `~/epaper-emulator.env`.
3. Keep only `~/epaper-emulator/docker-compose.yml` on the server, plus `~/epaper-emulator/config/` if needed later.
4. GitHub Actions builds the Docker image, uploads it, and runs `docker compose up -d --no-build`.
5. Open ports `80` and `443` in the Lightsail firewall.

Run the app on `127.0.0.1:3000` and proxy `epaper-hub.yeyintlwin.com` to it with Nginx.
