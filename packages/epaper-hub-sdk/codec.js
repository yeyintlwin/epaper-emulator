const DISPLAY_WIDTH = 296;
const DISPLAY_HEIGHT = 128;
const PACKED_FORMAT = "epd-2bit-v1";
const PACKED_BYTE_LENGTH = Math.ceil((DISPLAY_WIDTH * DISPLAY_HEIGHT * 2) / 8);

const COLOR_TO_BITS = { W: 0, B: 1, R: 2 };
const BITS_TO_COLOR = ["W", "B", "R", "W"];

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length !== DISPLAY_HEIGHT) {
    throw new Error(`Bitmap must contain ${DISPLAY_HEIGHT} rows`);
  }

  return rows.map((row) => {
    const value = String(row || "").toUpperCase();
    let normalized = "";
    for (let x = 0; x < DISPLAY_WIDTH; x += 1) {
      normalized += value[x] === "B" || value[x] === "R" ? value[x] : "W";
    }
    return normalized;
  });
}

function encodeBitmapRows(rows) {
  const packed = new Uint8Array(PACKED_BYTE_LENGTH);
  let pixelIndex = 0;

  for (const row of normalizeRows(rows)) {
    for (let x = 0; x < DISPLAY_WIDTH; x += 1) {
      const byteIndex = Math.floor(pixelIndex / 4);
      const shift = 6 - (pixelIndex % 4) * 2;
      packed[byteIndex] |= COLOR_TO_BITS[row[x]] << shift;
      pixelIndex += 1;
    }
  }

  return {
    format: PACKED_FORMAT,
    width: DISPLAY_WIDTH,
    height: DISPLAY_HEIGHT,
    data: Buffer.from(packed).toString("base64")
  };
}

function decodePackedBase64(payload) {
  if (!payload || payload.format !== PACKED_FORMAT) {
    throw new Error(`Payload format must be ${PACKED_FORMAT}`);
  }
  if (payload.width !== DISPLAY_WIDTH || payload.height !== DISPLAY_HEIGHT) {
    throw new Error(`Payload dimensions must be ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}`);
  }
  if (typeof payload.data !== "string") throw new Error("Payload data must be a base64 string");

  const packed = Buffer.from(payload.data, "base64");
  if (packed.length !== PACKED_BYTE_LENGTH) {
    throw new Error(`Packed bitmap must decode to ${PACKED_BYTE_LENGTH} bytes`);
  }

  const rows = [];
  let pixelIndex = 0;
  for (let y = 0; y < DISPLAY_HEIGHT; y += 1) {
    let row = "";
    for (let x = 0; x < DISPLAY_WIDTH; x += 1) {
      const byteIndex = Math.floor(pixelIndex / 4);
      const shift = 6 - (pixelIndex % 4) * 2;
      row += BITS_TO_COLOR[(packed[byteIndex] >> shift) & 0b11];
      pixelIndex += 1;
    }
    rows.push(row);
  }
  return rows;
}

module.exports = {
  decodePackedBase64,
  encodeBitmapRows,
  normalizeRows,
  DISPLAY_HEIGHT,
  DISPLAY_WIDTH,
  PACKED_BYTE_LENGTH,
  PACKED_FORMAT
};
