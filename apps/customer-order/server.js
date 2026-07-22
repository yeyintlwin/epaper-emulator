const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createEpaperClient } = require("./epaper-client");
const { createOrderStore, MAX_TABLE_NUMBER } = require("./order-store");
const { createTableVisitStore } = require("./table-visit-store");

const PUBLIC_ROOT = path.join(__dirname, "public");

function createConfiguredEpaperClient(requireStartupConfiguration = false) {
  const hubUrl = process.env.EPAPER_HUB_URL;
  const apiKey = process.env.EPAPER_API_KEY || process.env.API_KEY;
  const orderBaseUrl = process.env.ORDER_BASE_URL;
  if (requireStartupConfiguration && (!hubUrl || !apiKey || !orderBaseUrl)) {
    throw new Error("E-paper startup configuration is incomplete");
  }
  return createEpaperClient({
    hubUrl,
    apiKey,
    orderBaseUrl
  });
}

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
  const visitStore = options.visitStore;
  const pendingEpaperTables = new Set();
  const tableDisplayUpdates = new Map();
  const tableDisplayApiKey = options.tableDisplayApiKey ?? process.env.TABLE_DISPLAY_API_KEY;
  const epaperClient = options.epaperClient || createConfiguredEpaperClient();

  function runTableDisplayUpdate(tableNumber, update) {
    const previous = tableDisplayUpdates.get(tableNumber) || Promise.resolve();
    const next = previous.catch(() => undefined).then(update);
    tableDisplayUpdates.set(tableNumber, next);
    return next.finally(() => {
      if (tableDisplayUpdates.get(tableNumber) === next) tableDisplayUpdates.delete(tableNumber);
    });
  }

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
        const response = await runTableDisplayUpdate(tableNumber, async () => {
          if (store.getSession(tableNumber).status === "Table is in use") {
            return { status: 409, body: { error: "Table is in use" } };
          }
          try {
            const result = await epaperClient.updateTableWelcome(tableNumber, visitStore.getOrderingUrl(tableNumber));
            if (result?.skipped) {
              return { status: 503, body: { error: "E-paper hub is not configured" } };
            }
            return { status: 200, body: { ok: true, tableNumber, status: "Welcome" } };
          } catch {
            return { status: 502, body: { error: "E-paper display update failed" } };
          }
        });
        return sendJson(res, response.status, response.body);
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
            epaperUpdate = await runTableDisplayUpdate(tableNumber, () => (
              epaperClient.updateTableInUse(tableNumber, visitStore.getOrderingUrl(tableNumber))
            ));
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

async function initializeTableDisplays(options = {}) {
  const epaperClient = options.epaperClient;
  const visitStore = options.visitStore;
  const attempts = options.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error("attempts must be a positive integer");
  }
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const retryDelayMs = options.retryDelayMs ?? 1000;

  await Promise.all(Array.from({ length: MAX_TABLE_NUMBER }, async (_, index) => {
    const tableNumber = index + 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await epaperClient.updateTableWelcome(tableNumber, visitStore.getOrderingUrl(tableNumber));
        if (result?.skipped) {
          const error = new Error("E-paper hub is not configured");
          error.code = "EPAPER_CONFIGURATION";
          throw error;
        }
        return;
      } catch (error) {
        if (attempt === attempts || !isTransientEpaperError(error)) {
          throw new Error(`Failed to initialize e-paper table ${tableNumber}`, { cause: error });
        }
        await sleep(retryDelayMs);
      }
    }
  }));
}

function isTransientEpaperError(error) {
  const message = String(error?.message || "");
  if (
    error?.code === "EPAPER_CONFIGURATION" ||
    error?.code === "ERR_INVALID_URL" ||
    /^(?:baseUrl|apiKey|epaperId|tableNumber|status|url)\b.*\b(?:must|is required)\b|^url is too long for the e-paper QR area$|^Invalid URL$/.test(message)
  ) return false;
  const status = /(?:^|\D)([1-5]\d{2})(?:\D|$)/.exec(message);
  if (!status) return true;
  const value = Number(status[1]);
  return value === 408 || value === 429 || value >= 500;
}

function listenServer(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
}

async function start(options = {}) {
  const epaperClient = options.epaperClient || createConfiguredEpaperClient(true);
  const visitStore = options.visitStore || createTableVisitStore({
    shopId: "1",
    orderBaseUrl: options.orderBaseUrl || process.env.ORDER_BASE_URL || "https://order.yeyintlwin.com"
  });
  visitStore.createInitialVisits();
  const server = options.server || createServer({ ...options, epaperClient, visitStore });
  const port = options.port ?? Number(process.env.PORT || 3100);
  const listen = options.listen || listenServer;

  await initializeTableDisplays({ ...options, epaperClient, visitStore });
  await listen(server, port);
  return server;
}

if (require.main === module) {
  loadDotEnv();
  start().then(() => {
    const port = Number(process.env.PORT || 3100);
    console.log(`Customer order app listening on http://localhost:${port}`);
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { createServer, initializeTableDisplays, loadDotEnv, start };
