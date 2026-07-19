const assert = require("node:assert/strict");
const test = require("node:test");
const { decodePackedBase64, encodeBitmapRows, DISPLAY_HEIGHT, DISPLAY_WIDTH } = require("../epaper-codec");

function sampleRows() {
  return Array.from({ length: DISPLAY_HEIGHT }, (_, y) =>
    Array.from({ length: DISPLAY_WIDTH }, (_, x) => {
      if (x === y || x === DISPLAY_WIDTH - y - 1) return "R";
      if ((x + y) % 7 === 0) return "B";
      return "W";
    }).join("")
  );
}

test("encodes a 296x128 three-color bitmap into 9472 packed bytes", () => {
  const encoded = encodeBitmapRows(sampleRows());

  assert.equal(encoded.format, "epd-2bit-v1");
  assert.equal(encoded.width, DISPLAY_WIDTH);
  assert.equal(encoded.height, DISPLAY_HEIGHT);
  assert.equal(Buffer.from(encoded.data, "base64").length, 9472);
});

test("decodes packed base64 back into the original rows", () => {
  const rows = sampleRows();
  const encoded = encodeBitmapRows(rows);

  assert.deepEqual(decodePackedBase64(encoded), rows);
});

test("rejects packed payloads with the wrong byte length", () => {
  assert.throws(
    () =>
      decodePackedBase64({
        format: "epd-2bit-v1",
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        data: Buffer.from([0, 1, 2]).toString("base64")
      }),
    /9472 bytes/
  );
});
