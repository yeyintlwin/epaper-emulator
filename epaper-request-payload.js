const { PACKED_FORMAT } = require("./epaper-codec");

function selectUpdatePayload(body) {
  if (body && body.format === PACKED_FORMAT) return body;
  return body && body.data !== undefined ? body.data : body;
}

module.exports = { selectUpdatePayload };
