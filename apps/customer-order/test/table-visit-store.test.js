const assert = require("node:assert/strict");
const test = require("node:test");
const { createTableVisitStore } = require("../table-visit-store");

function deterministicRandom() {
  let value = 0;
  return (size) => Buffer.alloc(size, value++);
}

function queuedRandom(values) {
  let index = 0;
  return (size) => Buffer.alloc(size, values[Math.min(index++, values.length - 1)]);
}

test("creates twelve concise unique table visits without exposing secrets", () => {
  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    now: () => new Date("2026-07-22T03:00:00.000Z"),
    randomBytes: deterministicRandom()
  });

  const visits = store.createInitialVisits();
  assert.equal(visits.length, 12);
  assert.equal(new Set(visits.map((visit) => visit.orderingUrl)).size, 12);
  assert.equal(visits[0].orderingUrl.length, 53);
  assert.match(visits[0].orderingUrl, /^https:\/\/order\.yeyintlwin\.com\/t\/[A-Za-z0-9_-]{22}$/);
  assert.equal(visits[0].businessDate, "2026-07-22");
  assert.equal(visits[0].shopId, "1");
  assert.equal(visits[0].generation, 1);
  assert.equal(visits[0].expiresAt, "2026-07-22T21:00:00.000Z");
  assert.equal("token" in visits[0], false);
  assert.equal("tokenHash" in visits[0], false);
});

test("enrolls multiple phones into one visit and revokes both on rotation", () => {
  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    now: () => new Date("2026-07-22T03:00:00.000Z"),
    randomBytes: deterministicRandom()
  });
  store.createInitialVisits();
  const token = store.getRawTokenForDisplay(7);
  const first = store.enroll(token);
  const second = store.enroll(token);

  assert.match(first.sessionId, /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(first.visit.tableNumber, 7);
  assert.equal(second.visit.generation, first.visit.generation);
  assert.equal(store.markInUse(7).status, "in_use");

  const rotation = store.beginRotation(7);
  assert.equal(store.resolvePhoneSession(first.sessionId), null);
  assert.equal(store.resolvePhoneSession(second.sessionId), null);
  assert.equal(store.enroll(token), null);
  assert.equal(store.beginRotation(7).orderingUrl, rotation.orderingUrl);
  assert.equal(store.beginRotation(7).generation, rotation.generation);
  assert.equal(store.completeRotation(7).status, "welcome");
});

test("expires visits at the Tokyo six o'clock rollover and completes one pending rotation", () => {
  let current = new Date("2026-07-22T03:00:00.000Z");
  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    now: () => current,
    randomBytes: deterministicRandom()
  });
  store.createInitialVisits();
  const token = store.getRawTokenForDisplay(7);
  const session = store.enroll(token);
  current = new Date("2026-07-22T21:00:00.000Z");

  assert.equal(store.enroll(token), null);
  assert.equal(store.resolvePhoneSession(session.sessionId), null);
  assert.equal(store.expiredTableNumbers().includes(7), true);

  const pending = store.beginRotation(7);
  assert.equal(pending.generation, 2);
  assert.equal(pending.status, "pending_display");
  assert.equal(store.beginRotation(7).orderingUrl, pending.orderingUrl);
  assert.equal(store.beginRotation(7).generation, 2);
  assert.equal(store.completeRotation(7).status, "welcome");
  assert.equal(store.getCurrentVisit(7).orderingUrl, pending.orderingUrl);
});

test("replaces an expired pending display while preserving same-day retry identity", () => {
  let current = new Date("2026-07-22T20:59:00.000Z");
  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    now: () => current,
    randomBytes: deterministicRandom()
  });
  store.createInitialVisits();

  const pending = store.beginRotation(7);
  const pendingToken = store.getRawTokenForDisplay(7);
  const sameDayRetry = store.beginRotation(7);

  assert.equal(sameDayRetry.generation, pending.generation);
  assert.equal(sameDayRetry.orderingUrl, pending.orderingUrl);
  assert.equal(store.getRawTokenForDisplay(7), pendingToken);

  current = new Date("2026-07-22T21:00:00.000Z");
  assert.equal(store.expiredTableNumbers().includes(7), true);
  assert.equal(store.completeRotation(7), null);

  const replacement = store.beginRotation(7);
  assert.equal(replacement.generation, pending.generation + 1);
  assert.notEqual(replacement.orderingUrl, pending.orderingUrl);
  assert.notEqual(store.getRawTokenForDisplay(7), pendingToken);
  assert.equal(replacement.status, "pending_display");
  assert.equal(store.completeRotation(7).orderingUrl, replacement.orderingUrl);
});

test("rejects invalid configuration, table IDs, and raw credentials", () => {
  assert.throws(() => createTableVisitStore({ shopId: "", orderBaseUrl: "https://order.example.test" }), /shopId/);
  assert.throws(() => createTableVisitStore({ shopId: "1", orderBaseUrl: "http://order.example.test" }), /https/);

  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    randomBytes: deterministicRandom()
  });
  store.createInitialVisits();

  assert.throws(() => store.getCurrentVisit(0), /tableNumber/);
  assert.throws(() => store.getOrderingUrl(13), /tableNumber/);
  assert.equal(store.enroll("too-short"), null);
  assert.equal(store.resolvePhoneSession("not-a-session"), null);
  assert.equal(store.completeRotation(7), null);
});

test("requires the production shop and ordering origin", () => {
  assert.throws(() => createTableVisitStore({
    shopId: "2",
    orderBaseUrl: "https://order.yeyintlwin.com"
  }), /shopId must be exactly \"1\"/);
  assert.throws(() => createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.example.test"
  }), /orderBaseUrl origin must be https:\/\/order\.yeyintlwin\.com/);
});

test("retries duplicate table tokens and phone sessions", () => {
  const randomValues = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 99, 99, 100];
  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    randomBytes: queuedRandom(randomValues)
  });

  const visits = store.createInitialVisits();
  assert.equal(new Set(visits.map((visit) => visit.orderingUrl)).size, 12);

  const token = store.getRawTokenForDisplay(7);
  const first = store.enroll(token);
  const second = store.enroll(token);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.notEqual(store.resolvePhoneSession(first.sessionId), null);
  assert.notEqual(store.resolvePhoneSession(second.sessionId), null);
});

test("fails safely when credential collisions never resolve", () => {
  const store = createTableVisitStore({
    shopId: "1",
    orderBaseUrl: "https://order.yeyintlwin.com",
    randomBytes: () => Buffer.alloc(16)
  });

  assert.throws(() => store.createInitialVisits(), /unique table token/);
});
