# E-paper Emulator

Web application and API emulator for 12 e-paper displays. Each display has a fixed 296x128 pixel canvas and supports white, black, and red.

## Run Locally

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000`.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

## Secure Update API

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

The web designer uses this compact format automatically. The server still accepts the older debug formats, `bitmap` rows and `pixels`, for manual testing.

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
2. Copy this project to the server.
3. Create `.env` from `.env.example` and set a strong `API_KEY`.
4. Run `docker compose up -d --build`.
5. Open ports `80` and `443` in the Lightsail firewall.

Set `DOMAIN=epaper-hub.yeyintlwin.com` in `.env`. Caddy terminates HTTPS and proxies to the app.
