const crypto = require("node:crypto");

const MAX_TABLE_NUMBER = 12;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ROLLOVER_HOUR = 6;
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const MAX_CREDENTIAL_ATTEMPTS = 10;
const PRODUCTION_SHOP_ID = "1";
const PRODUCTION_ORDER_ORIGIN = "https://order.yeyintlwin.com";

function randomId(randomBytes) {
  return randomBytes(16).toString("base64url");
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function uniqueCredential(randomBytes, used, label) {
  for (let attempt = 0; attempt < MAX_CREDENTIAL_ATTEMPTS; attempt += 1) {
    const raw = randomId(randomBytes);
    const hash = digest(raw);
    if (!used.has(hash)) return { raw, hash };
  }
  throw new Error(`Unable to generate unique ${label}`);
}

function businessClock(instant) {
  const jst = new Date(instant.getTime() + JST_OFFSET_MS);
  const shifted = new Date(jst.getTime() - ROLLOVER_HOUR * 60 * 60 * 1000);
  const businessDate = shifted.toISOString().slice(0, 10);
  const nextRolloverJst = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + (jst.getUTCHours() >= ROLLOVER_HOUR ? 1 : 0),
    ROLLOVER_HOUR
  );
  return {
    businessDate,
    expiresAt: new Date(nextRolloverJst - JST_OFFSET_MS).toISOString()
  };
}

function normalizeTableNumber(value) {
  const tableNumber = Number(value);
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > MAX_TABLE_NUMBER) {
    throw new Error("tableNumber must be between 1 and 12");
  }
  return tableNumber;
}

function snapshot(visit) {
  if (!visit) return null;
  return JSON.parse(JSON.stringify({
    shopId: visit.shopId,
    businessDate: visit.businessDate,
    tableNumber: visit.tableNumber,
    generation: visit.generation,
    orderingUrl: visit.orderingUrl,
    status: visit.status,
    expiresAt: visit.expiresAt,
    slipNumber: visit.slipNumber,
    orders: visit.orders,
    totals: visit.totals
  }));
}

function createTableVisitStore(options = {}) {
  if (options.shopId !== PRODUCTION_SHOP_ID) {
    throw new Error('shopId must be exactly "1"');
  }

  let baseUrl;
  try {
    baseUrl = new URL(options.orderBaseUrl);
  } catch {
    throw new Error("orderBaseUrl must be an https URL");
  }
  if (baseUrl.origin !== PRODUCTION_ORDER_ORIGIN || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error(`orderBaseUrl origin must be ${PRODUCTION_ORDER_ORIGIN}`);
  }

  const now = options.now || (() => new Date());
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const visits = new Map();
  const tokenVisits = new Map();
  const rawTokens = new Map();
  const sessions = new Map();

  function currentInstant() {
    const instant = new Date(now());
    if (Number.isNaN(instant.getTime())) throw new Error("now must return a valid date");
    return instant;
  }

  function isExpired(visit) {
    return currentInstant() >= new Date(visit.expiresAt);
  }

  function isActive(visit) {
    return visit && (visit.status === "welcome" || visit.status === "in_use") && !isExpired(visit);
  }

  function createVisit(tableNumber, generation, status = "welcome") {
    const token = uniqueCredential(randomBytes, tokenVisits, "table token");
    const clock = businessClock(currentInstant());
    const visit = {
      shopId: options.shopId,
      businessDate: clock.businessDate,
      tableNumber,
      generation,
      tokenHash: token.hash,
      orderingUrl: new URL(`/t/${token.raw}`, baseUrl).toString(),
      status,
      expiresAt: clock.expiresAt,
      slipNumber: null,
      orders: [],
      totals: { subtotal: 0, serviceFee: 0, tax: 0, total: 0 }
    };
    visits.set(tableNumber, visit);
    tokenVisits.set(token.hash, visit);
    rawTokens.set(tableNumber, token.raw);
    return visit;
  }

  function revokeVisitCredentials(visit) {
    tokenVisits.delete(visit.tokenHash);
    for (const [sessionHash, sessionVisit] of sessions) {
      if (sessionVisit === visit) sessions.delete(sessionHash);
    }
  }

  function createInitialVisits() {
    visits.clear();
    tokenVisits.clear();
    rawTokens.clear();
    sessions.clear();
    return Array.from({ length: MAX_TABLE_NUMBER }, (_, index) => snapshot(createVisit(index + 1, 1)));
  }

  function getCurrentVisit(tableNumber) {
    return snapshot(visits.get(normalizeTableNumber(tableNumber)));
  }

  function getOrderingUrl(tableNumber) {
    const visit = visits.get(normalizeTableNumber(tableNumber));
    return visit ? visit.orderingUrl : null;
  }

  function getRawTokenForDisplay(tableNumber) {
    return rawTokens.get(normalizeTableNumber(tableNumber)) || null;
  }

  function enroll(rawToken) {
    if (typeof rawToken !== "string" || !CREDENTIAL_PATTERN.test(rawToken)) return null;
    const visit = tokenVisits.get(digest(rawToken));
    if (!isActive(visit)) return null;
    const session = uniqueCredential(randomBytes, sessions, "phone session");
    sessions.set(session.hash, visit);
    return { sessionId: session.raw, visit: snapshot(visit) };
  }

  function resolvePhoneSession(rawSession) {
    if (typeof rawSession !== "string" || !CREDENTIAL_PATTERN.test(rawSession)) return null;
    const sessionHash = digest(rawSession);
    const visit = sessions.get(sessionHash);
    if (!isActive(visit)) {
      sessions.delete(sessionHash);
      return null;
    }
    return snapshot(visit);
  }

  function markInUse(tableNumber) {
    const visit = visits.get(normalizeTableNumber(tableNumber));
    if (!isActive(visit)) return null;
    visit.status = "in_use";
    return snapshot(visit);
  }

  function beginRotation(tableNumber) {
    const normalizedTable = normalizeTableNumber(tableNumber);
    const current = visits.get(normalizedTable);
    if (!current) return null;
    if (current.status === "pending_display" && !isExpired(current)) return snapshot(current);

    revokeVisitCredentials(current);
    current.status = "closed";
    rawTokens.delete(normalizedTable);
    const replacement = createVisit(normalizedTable, current.generation + 1, "pending_display");
    return snapshot(replacement);
  }

  function completeRotation(tableNumber) {
    const visit = visits.get(normalizeTableNumber(tableNumber));
    if (!visit || visit.status !== "pending_display" || isExpired(visit)) return null;
    visit.status = "welcome";
    return snapshot(visit);
  }

  function expiredTableNumbers() {
    return [...visits.values()]
      .filter((visit) => ["welcome", "in_use", "pending_display"].includes(visit.status) && isExpired(visit))
      .map((visit) => visit.tableNumber)
      .sort((left, right) => left - right);
  }

  return {
    createInitialVisits,
    getCurrentVisit,
    getOrderingUrl,
    getRawTokenForDisplay,
    enroll,
    resolvePhoneSession,
    markInUse,
    beginRotation,
    completeRotation,
    expiredTableNumbers
  };
}

module.exports = { createTableVisitStore };
