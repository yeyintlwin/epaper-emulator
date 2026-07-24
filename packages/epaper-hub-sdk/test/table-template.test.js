const assert = require("node:assert/strict");
const test = require("node:test");
const { decodePackedBase64, PACKED_BYTE_LENGTH } = require("../codec");
const { renderTableDisplay } = require("../table-template");

test("renders a compact 296x128 three-color table display", () => {
  const payload = renderTableDisplay({
    tableNumber: 7,
    status: "Table is in use",
    url: "https://order.example.test/t/EXAMPLEtokenEXAMPLEtok"
  });

  assert.equal(payload.format, "epd-2bit-v1");
  assert.equal(payload.width, 296);
  assert.equal(payload.height, 128);
  assert.equal(Buffer.from(payload.data, "base64").length, PACKED_BYTE_LENGTH);

  const rows = decodePackedBase64(payload);
  assert.equal(rows.length, 128);
  assert.ok(rows.some((row) => row.includes("B")));
  assert.ok(rows.some((row) => row.includes("R")));
});

test("embeds the exact ordering URL into different QR pixels", () => {
  const common = { tableNumber: 7, status: "Welcome" };
  const first = renderTableDisplay({ ...common, url: "https://order.example.test/t/EXAMPLEtokenEXAMPLEtok" });
  const second = renderTableDisplay({ ...common, url: "https://order.example.test/t/SECONDtokenSECONDtok22" });

  assert.notEqual(first.data, second.data);
});

test("renders different status text into the frame", () => {
  const common = { tableNumber: 7, url: "https://order.example.test/t/EXAMPLEtokenEXAMPLEtok" };
  const welcome = renderTableDisplay({ ...common, status: "Welcome" });
  const inUse = renderTableDisplay({ ...common, status: "Table is in use" });

  assert.notEqual(welcome.data, inUse.data);
});

test("renders QR modules at the largest supported one-pixel scale", () => {
  const payload = renderTableDisplay({
    tableNumber: 1,
    status: "Welcome",
    url: `https://order.example.test/?token=${"x".repeat(425)}`
  });
  const rows = decodePackedBase64(payload);
  const darkQrPixels = rows
    .slice(16, 112)
    .reduce((total, row) => total + [...row.slice(196, 292)].filter((pixel) => pixel === "B").length, 0);

  assert.ok(darkQrPixels > 100);
});

test("fits a production opaque table visit URL", () => {
  const payload = renderTableDisplay({
    tableNumber: 12,
    status: "Table is in use",
    url: "https://order.yeyintlwin.com/t/______________________"
  });

  assert.equal(payload.width, 296);
  assert.equal(payload.height, 128);
});

test("validates table template input", () => {
  assert.throws(
    () => renderTableDisplay({ tableNumber: 0, status: "Welcome", url: "https://order.example.test" }),
    /tableNumber must be an integer from 1 to 12/
  );
  assert.throws(
    () => renderTableDisplay({ tableNumber: 1, status: "", url: "https://order.example.test" }),
    /status is required/
  );
  assert.throws(
    () => renderTableDisplay({ tableNumber: 1, status: "Welcome", url: "not-a-url" }),
    /url must be an http or https URL/
  );
  assert.throws(
    () => renderTableDisplay({
      tableNumber: 1,
      status: "Welcome",
      url: `https://order.example.test/?token=${"x".repeat(500)}`
    }),
    /url is too long for the e-paper QR area/
  );
});
