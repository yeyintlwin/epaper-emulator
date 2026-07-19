const assert = require("node:assert/strict");
const test = require("node:test");
const { decodePackedBase64, PACKED_FORMAT } = require("../epaper-codec");
const { createDemoFrames } = require("../scripts/demo-epapers");

test("demo frames create 12 compact icon payloads", () => {
  const frames = createDemoFrames();

  assert.equal(frames.length, 12);
  assert.equal(new Set(frames.map((frame) => frame.id)).size, 12);
  assert.equal(new Set(frames.map((frame) => frame.label)).size, 12);

  for (const frame of frames) {
    assert.equal(frame.payload.format, PACKED_FORMAT);
    assert.equal(frame.payload.width, 296);
    assert.equal(frame.payload.height, 128);
    assert.ok(frame.icon);

    const rows = decodePackedBase64(frame.payload);
    assert.equal(rows.length, 128);
    assert.ok(rows.some((row) => row.includes("B")));
    assert.ok(rows.some((row) => row.includes("R")));
  }
});
