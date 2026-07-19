const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createEpaperClient } = require("./epaper-client");
const { createOrderStore, MAX_TABLE_NUMBER } = require("./order-store");

const PUBLIC_ROOT = path.join(__dirname, "public");

function loadDotEnv(file = path.join(__dirname, ".env")) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function bearerMatches(header, expected) {
  const prefix = "Bearer ";
  if (!String(header || "").startsWith(prefix) || !expected) return false;
  const supplied = crypto.createHash("sha256").update(String(header).slice(prefix.length)).digest();
  const configured = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(supplied, configured);
}

function contentType(filePath) {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  return "text/html; charset=utf-8";
}

function sendStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.normalize(path.join(PUBLIC_ROOT, requested));

  if (!filePath.startsWith(PUBLIC_ROOT)) return sendJson(res, 404, { error: "Not found" });
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendJson(res, 404, { error: "Not found" });
  }

  res.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
}

function createServer(options = {}) {
  const store = options.store || createOrderStore({ now: options.now });
  const pendingEpaperTables = new Set();
  const tableDisplayApiKey = options.tableDisplayApiKey ?? process.env.TABLE_DISPLAY_API_KEY;
  const epaperClient = options.epaperClient || createEpaperClient({
    hubUrl: process.env.EPAPER_HUB_URL,
    apiKey: process.env.EPAPER_API_KEY || process.env.API_KEY,
    orderBaseUrl: process.env.ORDER_BASE_URL
  });

  async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { ok: true, app: "customer-order" });
      }

      if (req.method === "GET" && url.pathname === "/api/config") {
        return sendJson(res, 200, { maxTableNumber: MAX_TABLE_NUMBER, currency: "JPY" });
      }

      if (req.method === "GET" && url.pathname === "/api/menu") {
        return sendJson(res, 200, store.getMenu());
      }

      if (req.method === "GET" && url.pathname === "/api/session") {
        return sendJson(res, 200, { session: store.getSession(url.searchParams.get("table_number")) });
      }

      const welcomeRoute = url.pathname.match(/^\/api\/table-displays\/([^/]+)\/welcome$/);
      if (req.method === "POST" && welcomeRoute) {
        if (!tableDisplayApiKey) {
          return sendJson(res, 503, { error: "Table display provisioning is not configured" });
        }
        if (!bearerMatches(req.headers.authorization, tableDisplayApiKey)) {
          return sendJson(res, 401, { error: "Unauthorized" });
        }

        if (!/^(?:[1-9]|1[0-2])$/.test(welcomeRoute[1])) {
          return sendJson(res, 400, { error: `table number must be between 1 and ${MAX_TABLE_NUMBER}` });
        }
        const tableNumber = Number(welcomeRoute[1]);
        if (store.getSession(tableNumber).status === "Table is in use") {
          return sendJson(res, 409, { error: "Table is in use" });
        }

        try {
          const result = await epaperClient.updateTableWelcome(tableNumber);
          if (result?.skipped) {
            return sendJson(res, 503, { error: "E-paper hub is not configured" });
          }
          return sendJson(res, 200, { ok: true, tableNumber, status: "Welcome" });
        } catch {
          return sendJson(res, 502, { error: "E-paper display update failed" });
        }
      }

      if (req.method === "POST" && url.pathname === "/api/orders") {
        const body = await readBody(req);
        const result = store.placeOrder({
          tableNumber: body.table_number,
          items: body.items
        });
        const tableNumber = result.session.tableNumber;
        let epaperUpdate = { ok: true };
        if (result.isFirstOrderForSession || pendingEpaperTables.has(tableNumber)) {
          try {
            epaperUpdate = await epaperClient.updateTableInUse(tableNumber, result.session);
            pendingEpaperTables.delete(tableNumber);
          } catch (error) {
            pendingEpaperTables.add(tableNumber);
            epaperUpdate = { ok: false, pending: true, error: error.message };
          }
        }
        return sendJson(res, 201, { ...result, epaperUpdate });
      }

      if (req.method === "POST" && url.pathname === "/api/staff-calls") {
        const body = await readBody(req);
        return sendJson(res, 201, { call: store.callStaff(body.table_number, body.reason) });
      }

      if (req.method === "GET") return sendStatic(req, res);
      return sendJson(res, 405, { error: "Method not allowed" });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const server = http.createServer(handler);
  server.inject = async (method, url, body, headers = {}) => {
    const chunks = [];
    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const req = {
      method,
      url,
      headers,
      on(event, listener) {
        if (event === "data" && bodyText) process.nextTick(() => listener(Buffer.from(bodyText)));
        if (event === "end") process.nextTick(listener);
        return req;
      },
      destroy() {}
    };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(status, headers) {
        res.statusCode = status;
        Object.assign(res.headers, headers);
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.from(chunk));
        res.finished();
      },
      getHeaders() {
        return res.headers;
      },
      finished() {}
    };

    await new Promise((resolve) => {
      res.finished = resolve;
      handler(req, res);
    });
    const text = Buffer.concat(chunks).toString();
    return {
      status: res.statusCode,
      headers: res.getHeaders(),
      body: text ? JSON.parse(text) : null
    };
  };

  return server;
}

if (require.main === module) {
  loadDotEnv();
  const port = Number(process.env.PORT || 3100);
  createServer().listen(port, () => {
    console.log(`Customer order app listening on http://localhost:${port}`);
  });
}

module.exports = { createServer, loadDotEnv };
