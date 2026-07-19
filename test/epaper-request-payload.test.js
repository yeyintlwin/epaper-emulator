const assert = require("node:assert/strict");
const test = require("node:test");
const { selectUpdatePayload } = require("../epaper-request-payload");

test("uses the whole request body for root compact frame payloads", () => {
  const body = {
    format: "epd-2bit-v1",
    width: 296,
    height: 128,
    data: "packed-base64"
  };

  assert.equal(selectUpdatePayload(body), body);
});

test("uses nested data for wrapper update payloads", () => {
  const nested = { format: "epd-2bit-v1", width: 296, height: 128, data: "packed-base64" };

  assert.equal(selectUpdatePayload({ id: 1, data: nested }), nested);
});
