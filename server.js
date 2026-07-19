const crypto = require("crypto");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const {
  decodePackedBase64,
  encodeBitmapRows,
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  PACKED_FORMAT
} = require("./epaper-codec");
const { selectUpdatePayload } = require("./epaper-request-payload");
const { createScreenStore } = require("./screen-store");
require("dotenv").config();

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || undefined;
const apiKey = process.env.API_KEY || "change-me-before-production";
const publicRead = process.env.PUBLIC_READ === "true";
const corsOrigin =
  !process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === "false" ? false : process.env.CORS_ORIGIN;

const DISPLAY_COUNT = 12;
const VALID_COLORS = new Set(["white", "black", "red"]);
const screenStore = createScreenStore(process.env.SCREEN_STORE_FILE);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: corsOrigin }));
app.use(morgan("combined"));
app.use(express.json({ limit: "5mb" }));
app.get("/epaper-codec.js", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("application/javascript").sendFile(path.join(__dirname, "epaper-codec.js"));
});
app.use(
  express.static("public", {
    setHeaders: (res) => res.set("Cache-Control", "no-store")
  })
);

const screens = new Map();
const clients = new Set();

function now() {
  return new Date().toISOString();
}

function defaultScreen(id) {
  return {
    id,
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    palette: ["white", "black", "red"],
    updatedAt: null,
    data: {
      title: `EPAPER ${id}`,
      text: "Waiting for update",
      background: "white",
      color: "black",
      accent: id % 3 === 0 ? "red" : "black",
      align: "center",
      size: "medium"
    }
  };
}

for (let id = 1; id <= DISPLAY_COUNT; id += 1) {
  screens.set(String(id), defaultScreen(id));
}

for (const screen of screenStore.load()) {
  const id = normalizeId(screen && screen.id);
  if (id) screens.set(id, { ...screens.get(id), ...screen, id: Number(id) });
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getToken(req) {
  const auth = req.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.get("x-api-key") || req.query.api_key || "";
}

function requireApiKey(req, res, next) {
  if (safeCompare(getToken(req), apiKey)) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function optionalApiKey(req, res, next) {
  if (publicRead || safeCompare(getToken(req), apiKey)) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

function normalizeId(rawId) {
  const id = String(rawId || "").trim();
  if (!screens.has(id)) return null;
  return id;
}

function normalizeColor(value, fallback) {
  const color = String(value || "").toLowerCase();
  return VALID_COLORS.has(color) ? color : fallback;
}

function normalizeData(input) {
  const data = input && typeof input === "object" ? input : { text: String(input ?? "") };
  const frame = normalizeFramePayload(data);
  const lines = Array.isArray(data.lines) ? data.lines.map((line) => String(line)).slice(0, 6) : undefined;
  const pixels = Array.isArray(data.pixels)
    ? data.pixels
        .filter((pixel) => pixel && Number.isFinite(pixel.x) && Number.isFinite(pixel.y))
        .slice(0, DISPLAY_WIDTH * DISPLAY_HEIGHT)
        .map((pixel) => ({
          x: Math.max(0, Math.min(DISPLAY_WIDTH - 1, Math.round(pixel.x))),
          y: Math.max(0, Math.min(DISPLAY_HEIGHT - 1, Math.round(pixel.y))),
          color: normalizeColor(pixel.color, "black")
        }))
    : undefined;

  return {
    title: data.title ? String(data.title).slice(0, 48) : "",
    text: data.text ? String(data.text).slice(0, 220) : "",
    frame,
    lines,
    pixels,
    background: normalizeColor(data.background, "white"),
    color: normalizeColor(data.color, "black"),
    accent: normalizeColor(data.accent, "red"),
    align: ["left", "center", "right"].includes(data.align) ? data.align : "center",
    size: ["small", "medium", "large"].includes(data.size) ? data.size : "medium"
  };
}

function normalizeBitmap(bitmap) {
  if (!Array.isArray(bitmap) || bitmap.length !== DISPLAY_HEIGHT) return undefined;

  return bitmap.map((row) => {
    const value = String(row || "").toUpperCase();
    let normalized = "";
    for (let x = 0; x < DISPLAY_WIDTH; x += 1) {
      const pixel = value[x];
      normalized += pixel === "B" || pixel === "R" ? pixel : "W";
    }
    return normalized;
  });
}

function normalizeBitmapPayload(data) {
  if (data.format === PACKED_FORMAT) return decodePackedBase64(data);
  return normalizeBitmap(data.bitmap);
}

function normalizeFramePayload(data) {
  if (data.format === PACKED_FORMAT) {
    decodePackedBase64(data);
    return {
      format: PACKED_FORMAT,
      width: DISPLAY_WIDTH,
      height: DISPLAY_HEIGHT,
      data: data.data
    };
  }

  const bitmap = normalizeBitmap(data.bitmap);
  return bitmap ? encodeBitmapRows(bitmap) : undefined;
}

function sendEvent(screen) {
  const event = `data: ${JSON.stringify(screen)}\n\n`;
  for (const client of clients) client.write(event);
}

function saveScreens() {
  screenStore.save(screens);
}

function apiDocsHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>E-paper Emulator API Docs</title>
    <style>
      :root { color-scheme: light; --ink: #151515; --muted: #65717c; --paper: #fbfbf7; --line: #d8ddd2; --red: #d62828; --green: #2f6f4e; --bg: #edf0e8; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; }
      main { width: min(960px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
      a { color: var(--green); font-weight: 750; }
      h1 { margin: 0 0 8px; font-size: clamp(30px, 5vw, 48px); letter-spacing: 0; }
      h2 { margin: 28px 0 10px; font-size: 22px; letter-spacing: 0; }
      p { color: var(--muted); }
      code, pre { border: 1px solid var(--line); border-radius: 6px; background: var(--paper); }
      code { padding: 2px 5px; }
      pre { overflow: auto; padding: 14px; }
      table { width: 100%; border-collapse: collapse; background: var(--paper); }
      th, td { border: 1px solid var(--line); padding: 10px; text-align: left; vertical-align: top; }
      th { color: var(--green); }
    </style>
  </head>
  <body>
    <main>
      <a href="/">Back to emulator</a>
      <h1>E-paper Emulator API</h1>
      <p>Controls 12 e-paper screens. Each screen is 296x128 pixels and supports white, black, and red.</p>

      <h2>Authentication</h2>
      <p>Write endpoints require either <code>Authorization: Bearer &lt;API_KEY&gt;</code> or <code>x-api-key: &lt;API_KEY&gt;</code>.</p>

      <h2>Endpoints</h2>
      <p>Most device updates use <code>POST /api/epapers/:id</code>.</p>
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td>GET</td><td><code>/health</code></td><td>Health check.</td></tr>
          <tr><td>GET</td><td><code>/api/epapers</code></td><td>List all 12 screens.</td></tr>
          <tr><td>GET</td><td><code>/api/epapers/:id</code></td><td>Read one screen by id, 1 through 12.</td></tr>
          <tr><td>POST</td><td><code>/api/epapers/:id</code></td><td>Update one screen by path id.</td></tr>
          <tr><td>POST</td><td><code>/api/update</code></td><td>Update one screen with <code>{ "id": 1, "data": ... }</code>.</td></tr>
          <tr><td>POST</td><td><code>/api/reset</code></td><td>Reset all screens.</td></tr>
          <tr><td>GET</td><td><code>/api/events</code></td><td>Server-sent events stream for realtime browser updates.</td></tr>
        </tbody>
      </table>

      <h2>Compact Pixel Format</h2>
      <p>Use <code>epd-2bit-v1</code>. It packs four pixels per byte: <code>00</code> white, <code>01</code> black, <code>10</code> red. A full frame is 9,472 bytes before base64.</p>
      <pre><code>{
  "format": "epd-2bit-v1",
  "width": 296,
  "height": 128,
  "data": "base64-packed-bytes"
}</code></pre>

      <h2>Update Example</h2>
      <pre><code>curl -X POST https://epaper-hub.yeyintlwin.com/api/epapers/1 \\
  -H "Authorization: Bearer &lt;API_KEY&gt;" \\
  -H "Content-Type: application/json" \\
  -d '{"format":"epd-2bit-v1","width":296,"height":128,"data":"base64-packed-bytes"}'</code></pre>

      <h2>Demo</h2>
      <pre><code>EPAPER_URL=https://epaper-hub.yeyintlwin.com API_KEY=your-key npm run demo</code></pre>
    </main>
  </body>
</html>`;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, screens: DISPLAY_COUNT, updatedAt: now() });
});

app.get("/api/docs", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.type("html").send(apiDocsHtml());
});

app.get("/api/epapers", optionalApiKey, (_req, res) => {
  res.json({ screens: Array.from(screens.values()) });
});

app.get("/api/epapers/:id", optionalApiKey, (req, res) => {
  const id = normalizeId(req.params.id);
  if (!id) return res.status(404).json({ error: "Unknown epaper id" });
  return res.json(screens.get(id));
});

app.post("/api/epapers/:id", requireApiKey, (req, res) => {
  const id = normalizeId(req.params.id);
  if (!id) return res.status(404).json({ error: "Unknown epaper id" });

  const screen = {
    ...screens.get(id),
    updatedAt: now(),
    data: normalizeData(selectUpdatePayload(req.body))
  };

  screens.set(id, screen);
  saveScreens();
  sendEvent(screen);
  return res.json({ ok: true, screen });
});

app.post("/api/update", requireApiKey, (req, res) => {
  const id = normalizeId(req.body.id);
  if (!id) return res.status(404).json({ error: "Unknown epaper id" });
  const screen = {
    ...screens.get(id),
    updatedAt: now(),
    data: normalizeData(selectUpdatePayload(req.body))
  };

  screens.set(id, screen);
  saveScreens();
  sendEvent(screen);
  return res.json({ ok: true, screen });
});

app.post("/api/reset", requireApiKey, (_req, res) => {
  for (let id = 1; id <= DISPLAY_COUNT; id += 1) {
    const screen = defaultScreen(id);
    screens.set(String(id), screen);
    sendEvent(screen);
  }
  saveScreens();
  res.json({ ok: true });
});

app.get("/api/events", optionalApiKey, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    Connection: "keep-alive"
  });
  if (res.flushHeaders) res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "snapshot", screens: Array.from(screens.values()) })}\n\n`);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  clients.add(res);
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
});

app.listen(port, host, () => {
  console.log(`E-paper emulator listening on port ${port}`);
});
