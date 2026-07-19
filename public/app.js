const grid = document.querySelector("#screenGrid");
const connectionDot = document.querySelector("#connectionDot");
const connectionText = document.querySelector("#connectionText");
const designerToggle = document.querySelector("#designerToggle");
const designerPanel = document.querySelector("#designerPanel");
const screenId = document.querySelector("#screenId");
const sendButton = document.querySelector("#sendButton");
const apiResult = document.querySelector("#apiResult");
const editorCanvas = document.querySelector("#pixelCanvas");
const editorCtx = editorCanvas.getContext("2d");
const brushSize = document.querySelector("#brushSize");
const zoomSize = document.querySelector("#zoomSize");
const clearButton = document.querySelector("#clearButton");
const fillButton = document.querySelector("#fillButton");

const colors = {
  white: "#f7f7f2",
  black: "#111111",
  red: "#d62828"
};

const state = new Map();
const bitmap = Array.from({ length: 128 }, () => Array.from({ length: 296 }, () => "W"));
let activeColor = "black";
let drawing = false;
let eventSource;

if (designerToggle && designerPanel) {
  designerToggle.addEventListener("click", () => {
    const hidden = designerPanel.classList.toggle("hidden");
    designerToggle.setAttribute("aria-expanded", String(!hidden));
  });
}

for (let id = 1; id <= 12; id += 1) {
  const option = document.createElement("option");
  option.value = String(id);
  option.textContent = `EPAPER ${id}`;
  screenId.append(option);
}

function setConnection(status) {
  connectionDot.className = `dot ${status}`;
  connectionText.textContent = status === "live" ? "Live" : status === "offline" ? "Offline" : "Connecting";
}

function displayText(data) {
  if (Array.isArray(data.lines) && data.lines.length) return data.lines.join("\n");
  return data.text || "";
}

function renderPixels(screenEl, pixels = []) {
  for (const pixel of pixels) {
    const node = document.createElement("span");
    node.className = `pixel ${pixel.color}`;
    node.style.left = `${(pixel.x / 296) * 100}%`;
    node.style.top = `${(pixel.y / 128) * 100}%`;
    screenEl.append(node);
  }
}

function paintBitmapToCanvas(canvas, rows) {
  if (rows && rows.format === "epd-2bit-v1") rows = decodePackedBase64(rows);
  if (!Array.isArray(rows) || rows.length !== 128) return false;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(296, 128);
  for (let y = 0; y < 128; y += 1) {
    const row = rows[y] || "";
    for (let x = 0; x < 296; x += 1) {
      const index = (y * 296 + x) * 4;
      const color = row[x] === "B" ? [17, 17, 17] : row[x] === "R" ? [214, 40, 40] : [247, 247, 242];
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return true;
}

function renderScreen(screen) {
  state.set(String(screen.id), screen);
  let device = document.querySelector(`[data-device-id="${screen.id}"]`);

  if (!device) {
    device = document.createElement("article");
    device.className = "device";
    device.dataset.deviceId = screen.id;
    grid.append(device);
  }

  const data = screen.data || {};
  const background = data.background || "white";
  const textColor = data.color || "black";
  const titleColor = data.accent || "red";

  device.innerHTML = `
    <div class="deviceHead">
      <strong>ID ${screen.id}</strong>
      <span>${screen.updatedAt ? new Date(screen.updatedAt).toLocaleString() : "Not updated"}</span>
    </div>
    <div class="screen ${background} ${data.align || "center"}">
      <canvas class="screenCanvas" width="296" height="128"></canvas>
      <div class="screenInner">
        <div class="screenTitle"></div>
        <div class="screenText ${data.size || "medium"}"></div>
      </div>
    </div>
  `;

  const screenEl = device.querySelector(".screen");
  const canvas = device.querySelector(".screenCanvas");
  const hasBitmap = paintBitmapToCanvas(canvas, data.frame || data.bitmap);
  const title = device.querySelector(".screenTitle");
  const text = device.querySelector(".screenText");

  title.textContent = hasBitmap ? "" : data.title || "";
  title.style.color = colors[titleColor] || colors.red;
  text.textContent = hasBitmap ? "" : displayText(data);
  text.style.color = colors[textColor] || colors.black;

  if (!hasBitmap) renderPixels(screenEl, data.pixels);
}

async function loadSnapshot() {
  const response = await fetch("/api/epapers");
  if (!response.ok) throw new Error(`Snapshot failed: ${response.status}`);
  const payload = await response.json();
  payload.screens.forEach(renderScreen);
}

function connectEvents() {
  eventSource = new EventSource("/api/events");
  eventSource.onopen = () => setConnection("live");
  eventSource.onerror = () => setConnection("offline");
  eventSource.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "snapshot") {
      payload.screens.forEach(renderScreen);
      return;
    }
    renderScreen(payload);
  };
}

sendButton.addEventListener("click", async () => {
  const key = document.querySelector("#apiKey").value.trim();
  const body = {
    title: document.querySelector("#title").value,
    ...encodeBitmapRows(bitmap.map((row) => row.join("")))
  };

  sendButton.disabled = true;
  apiResult.textContent = "Sending...";

  try {
    const response = await fetch(`/api/epapers/${screenId.value}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (payload.screen) renderScreen(payload.screen);
    apiResult.textContent = JSON.stringify(payload, null, 2);
  } catch (error) {
    apiResult.textContent = String(error);
  } finally {
    sendButton.disabled = false;
  }
});

function redrawEditor() {
  const image = editorCtx.createImageData(296, 128);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 296; x += 1) {
      const index = (y * 296 + x) * 4;
      const color = bitmap[y][x] === "B" ? [17, 17, 17] : bitmap[y][x] === "R" ? [214, 40, 40] : [247, 247, 242];
      image.data[index] = color[0];
      image.data[index + 1] = color[1];
      image.data[index + 2] = color[2];
      image.data[index + 3] = 255;
    }
  }
  editorCtx.putImageData(image, 0, 0);
}

function canvasPoint(event) {
  const rect = editorCanvas.getBoundingClientRect();
  return {
    x: Math.floor(((event.clientX - rect.left) / rect.width) * 296),
    y: Math.floor(((event.clientY - rect.top) / rect.height) * 128)
  };
}

function drawAt(event) {
  const point = canvasPoint(event);
  const size = Number(brushSize.value);
  const code = activeColor === "black" ? "B" : activeColor === "red" ? "R" : "W";
  const radius = Math.floor(size / 2);
  for (let y = point.y - radius; y < point.y - radius + size; y += 1) {
    for (let x = point.x - radius; x < point.x - radius + size; x += 1) {
      if (x >= 0 && x < 296 && y >= 0 && y < 128) bitmap[y][x] = code;
    }
  }
  redrawEditor();
}

editorCanvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  editorCanvas.setPointerCapture(event.pointerId);
  drawAt(event);
});

editorCanvas.addEventListener("pointermove", (event) => {
  if (drawing) drawAt(event);
});

editorCanvas.addEventListener("pointerup", () => {
  drawing = false;
});

editorCanvas.addEventListener("pointerleave", () => {
  drawing = false;
});

document.querySelectorAll(".swatch").forEach((button) => {
  button.addEventListener("click", () => {
    activeColor = button.dataset.color;
    document.querySelectorAll(".swatch").forEach((item) => item.classList.toggle("active", item === button));
  });
});

clearButton.addEventListener("click", () => {
  for (const row of bitmap) row.fill("W");
  redrawEditor();
});

fillButton.addEventListener("click", () => {
  const code = activeColor === "black" ? "B" : activeColor === "red" ? "R" : "W";
  for (const row of bitmap) row.fill(code);
  redrawEditor();
});

zoomSize.addEventListener("input", () => {
  const zoom = Number(zoomSize.value);
  editorCanvas.style.width = `${296 * zoom}px`;
  editorCanvas.style.height = `${128 * zoom}px`;
});

setConnection("connecting");
redrawEditor();
loadSnapshot().catch((error) => {
  setConnection("offline");
  apiResult.textContent = String(error);
});
connectEvents();
