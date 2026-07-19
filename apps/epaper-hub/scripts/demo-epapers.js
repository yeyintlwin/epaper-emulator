const { encodeBitmapRows, DISPLAY_HEIGHT, DISPLAY_WIDTH } = require("../epaper-codec");

const FONT = {
  " ": ["000", "000", "000", "000", "000", "000", "000"],
  "-": ["000", "000", "000", "111", "000", "000", "000"],
  0: ["111", "101", "101", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "010", "010", "111"],
  2: ["111", "001", "001", "111", "100", "100", "111"],
  3: ["111", "001", "001", "111", "001", "001", "111"],
  4: ["101", "101", "101", "111", "001", "001", "001"],
  5: ["111", "100", "100", "111", "001", "001", "111"],
  6: ["111", "100", "100", "111", "101", "101", "111"],
  7: ["111", "001", "001", "010", "010", "010", "010"],
  8: ["111", "101", "101", "111", "101", "101", "111"],
  9: ["111", "101", "101", "111", "001", "001", "111"],
  A: ["010", "101", "101", "111", "101", "101", "101"],
  B: ["110", "101", "101", "110", "101", "101", "110"],
  C: ["111", "100", "100", "100", "100", "100", "111"],
  D: ["110", "101", "101", "101", "101", "101", "110"],
  E: ["111", "100", "100", "111", "100", "100", "111"],
  F: ["111", "100", "100", "111", "100", "100", "100"],
  H: ["101", "101", "101", "111", "101", "101", "101"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  K: ["101", "101", "110", "100", "110", "101", "101"],
  L: ["100", "100", "100", "100", "100", "100", "111"],
  M: ["101", "111", "111", "101", "101", "101", "101"],
  N: ["101", "111", "111", "111", "111", "111", "101"],
  O: ["111", "101", "101", "101", "101", "101", "111"],
  P: ["111", "101", "101", "111", "100", "100", "100"],
  R: ["110", "101", "101", "110", "110", "101", "101"],
  S: ["111", "100", "100", "111", "001", "001", "111"],
  T: ["111", "010", "010", "010", "010", "010", "010"],
  U: ["101", "101", "101", "101", "101", "101", "111"],
  W: ["101", "101", "101", "101", "111", "111", "101"],
  Y: ["101", "101", "101", "010", "010", "010", "010"]
};

const DEMOS = [
  ["SUN", "sun"],
  ["MOON", "moon"],
  ["HEART", "heart"],
  ["STAR", "star"],
  ["WIFI", "wifi"],
  ["BATT", "battery"],
  ["BELL", "bell"],
  ["RAIN", "rain"],
  ["UP", "arrow"],
  ["TIME", "clock"],
  ["HOME", "home"],
  ["SMILE", "smile"]
];

function blankRows() {
  return Array.from({ length: DISPLAY_HEIGHT }, () => Array(DISPLAY_WIDTH).fill("W"));
}

function toRows(canvas) {
  return canvas.map((row) => row.join(""));
}

function pixel(canvas, x, y, color = "B") {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px >= 0 && px < DISPLAY_WIDTH && py >= 0 && py < DISPLAY_HEIGHT) canvas[py][px] = color;
}

function rect(canvas, x, y, width, height, color = "B", fill = false) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      if (fill || yy === y || yy === y + height - 1 || xx === x || xx === x + width - 1) {
        pixel(canvas, xx, yy, color);
      }
    }
  }
}

function line(canvas, x1, y1, x2, y2, color = "B") {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    pixel(canvas, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, color);
  }
}

function circle(canvas, cx, cy, radius, color = "B", fill = false) {
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const distance = Math.sqrt(x * x + y * y);
      if ((fill && distance <= radius) || (!fill && Math.abs(distance - radius) < 0.8)) {
        pixel(canvas, cx + x, cy + y, color);
      }
    }
  }
}

function text(canvas, value, x, y, color = "B", scale = 3) {
  let cursor = x;
  for (const char of String(value).toUpperCase()) {
    const glyph = FONT[char] || FONT[" "];
    glyph.forEach((row, gy) => {
      [...row].forEach((bit, gx) => {
        if (bit !== "1") return;
        rect(canvas, cursor + gx * scale, y + gy * scale, scale, scale, color, true);
      });
    });
    cursor += 4 * scale;
  }
}

function icon(canvas, name) {
  const cx = 70;
  const cy = 54;
  if (name === "sun") {
    circle(canvas, cx, cy, 18, "R", true);
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      line(canvas, cx + Math.cos(angle) * 25, cy + Math.sin(angle) * 25, cx + Math.cos(angle) * 38, cy + Math.sin(angle) * 38, "B");
    }
  } else if (name === "moon") {
    circle(canvas, cx, cy, 26, "B", true);
    circle(canvas, cx + 12, cy - 5, 23, "W", true);
    circle(canvas, cx + 20, cy - 18, 2, "R", true);
  } else if (name === "heart") {
    circle(canvas, cx - 11, cy - 8, 14, "R", true);
    circle(canvas, cx + 11, cy - 8, 14, "R", true);
    for (let y = -2; y <= 28; y += 1) {
      const half = Math.max(0, 28 - y);
      line(canvas, cx - half, cy + y, cx + half, cy + y, "R");
    }
  } else if (name === "star") {
    line(canvas, cx, cy - 35, cx + 9, cy - 8, "R");
    line(canvas, cx + 9, cy - 8, cx + 37, cy - 8, "R");
    line(canvas, cx + 37, cy - 8, cx + 14, cy + 8, "R");
    line(canvas, cx + 14, cy + 8, cx + 23, cy + 35, "R");
    line(canvas, cx + 23, cy + 35, cx, cy + 18, "R");
    line(canvas, cx, cy + 18, cx - 23, cy + 35, "R");
    line(canvas, cx - 23, cy + 35, cx - 14, cy + 8, "R");
    line(canvas, cx - 14, cy + 8, cx - 37, cy - 8, "R");
    line(canvas, cx - 37, cy - 8, cx - 9, cy - 8, "R");
    line(canvas, cx - 9, cy - 8, cx, cy - 35, "R");
    circle(canvas, cx, cy, 4, "B", true);
  } else if (name === "wifi") {
    for (let r = 14; r <= 42; r += 14) {
      for (let a = 210; a <= 330; a += 2) {
        const angle = (Math.PI * a) / 180;
        pixel(canvas, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, r === 42 ? "R" : "B");
      }
    }
    circle(canvas, cx, cy + 5, 5, "B", true);
  } else if (name === "battery") {
    rect(canvas, cx - 36, cy - 18, 64, 36, "B");
    rect(canvas, cx + 30, cy - 8, 8, 16, "B", true);
    rect(canvas, cx - 30, cy - 12, 38, 24, "R", true);
  } else if (name === "bell") {
    circle(canvas, cx, cy - 5, 23, "R");
    rect(canvas, cx - 24, cy - 2, 48, 29, "R", true);
    rect(canvas, cx - 34, cy + 25, 68, 5, "B", true);
    circle(canvas, cx, cy + 34, 6, "B", true);
  } else if (name === "rain") {
    circle(canvas, cx - 18, cy - 6, 15, "B", true);
    circle(canvas, cx, cy - 17, 20, "B", true);
    circle(canvas, cx + 22, cy - 7, 16, "B", true);
    rect(canvas, cx - 35, cy - 6, 72, 22, "B", true);
    for (let x = -27; x <= 27; x += 18) line(canvas, cx + x, cy + 30, cx + x - 8, cy + 45, "R");
  } else if (name === "arrow") {
    line(canvas, cx, cy - 35, cx, cy + 35, "B");
    line(canvas, cx, cy - 35, cx - 25, cy - 8, "R");
    line(canvas, cx, cy - 35, cx + 25, cy - 8, "R");
    rect(canvas, cx - 9, cy, 18, 36, "B", true);
  } else if (name === "clock") {
    circle(canvas, cx, cy, 34, "B");
    line(canvas, cx, cy, cx, cy - 22, "R");
    line(canvas, cx, cy, cx + 18, cy + 10, "R");
    circle(canvas, cx, cy, 4, "B", true);
  } else if (name === "home") {
    line(canvas, cx - 38, cy - 4, cx, cy - 38, "R");
    line(canvas, cx, cy - 38, cx + 38, cy - 4, "R");
    rect(canvas, cx - 29, cy - 4, 58, 48, "B");
    rect(canvas, cx - 8, cy + 18, 16, 26, "R", true);
  } else if (name === "smile") {
    circle(canvas, cx, cy, 34, "R");
    circle(canvas, cx - 12, cy - 8, 4, "B", true);
    circle(canvas, cx + 12, cy - 8, 4, "B", true);
    for (let a = 35; a <= 145; a += 2) {
      const angle = (Math.PI * a) / 180;
      pixel(canvas, cx + Math.cos(angle) * 20, cy + Math.sin(angle) * 18, "B");
    }
  }
}

function drawFrame(id, label, iconName) {
  const canvas = blankRows();
  rect(canvas, 0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT, "B");
  rect(canvas, 8, 8, DISPLAY_WIDTH - 16, DISPLAY_HEIGHT - 16, "R");
  icon(canvas, iconName);
  text(canvas, label, 132, 35, "B", 5);
  text(canvas, `ID-${String(id).padStart(2, "0")}`, 134, 83, "R", 3);
  return encodeBitmapRows(toRows(canvas));
}

function createDemoFrames() {
  return DEMOS.map(([label, iconName], index) => {
    const id = index + 1;
    return {
      id,
      label,
      icon: iconName,
      payload: drawFrame(id, label, iconName)
    };
  });
}

async function sendDemoFrames({ baseUrl, apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("API_KEY is required");
  const url = String(baseUrl || "https://epaper-hub.yeyintlwin.com").replace(/\/$/, "");
  const results = [];

  for (const frame of createDemoFrames()) {
    const response = await fetchImpl(`${url}/api/epapers/${frame.id}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(frame.payload)
    });
    if (!response.ok) throw new Error(`Screen ${frame.id} update failed: ${response.status}`);
    results.push({ id: frame.id, label: frame.label, icon: frame.icon });
  }

  return results;
}

if (require.main === module) {
  sendDemoFrames({ baseUrl: process.env.EPAPER_URL, apiKey: process.env.API_KEY })
    .then((results) => {
      for (const result of results) {
        console.log(`updated ${result.id}: ${result.label} (${result.icon})`);
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = { createDemoFrames, sendDemoFrames };
