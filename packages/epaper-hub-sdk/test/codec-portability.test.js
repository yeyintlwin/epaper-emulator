const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("compact codec works without files outside the SDK package", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "epaper-sdk-codec-"));
  const isolatedCodec = path.join(directory, "codec.js");
  fs.copyFileSync(path.join(__dirname, "..", "codec.js"), isolatedCodec);

  try {
    const { encodeBitmapRows, PACKED_BYTE_LENGTH } = require(isolatedCodec);
    const payload = encodeBitmapRows(Array.from({ length: 128 }, () => "W".repeat(296)));
    assert.equal(Buffer.from(payload.data, "base64").length, PACKED_BYTE_LENGTH);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
