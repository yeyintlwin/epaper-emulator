const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDemoFrames } = require("../scripts/demo-epapers");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (_error) {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
}

async function startServer(port, storeFile) {
  const child = childProcess.spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      API_KEY: "test-secret",
      HOST: "127.0.0.1",
      PUBLIC_READ: "true",
      SCREEN_STORE_FILE: storeFile
    },
    stdio: "ignore"
  });
  await waitForHealth(`http://127.0.0.1:${port}`);
  return child;
}

async function stopServer(child) {
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
}

test("server reloads latest screen frame after restart", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epaper-server-"));
  const storeFile = path.join(dir, "screens.json");
  let port;
  try {
    port = await freePort();
  } catch (error) {
    if (error.code === "EPERM") {
      t.skip("local sandbox does not allow binding test ports");
      return;
    }
    throw error;
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  const frame = createDemoFrames()[0].payload;

  let server = await startServer(port, storeFile);
  try {
    const response = await fetch(`${baseUrl}/api/epapers/1`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-secret",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(frame)
    });
    assert.equal(response.status, 200);
  } finally {
    await stopServer(server);
  }

  server = await startServer(port, storeFile);
  try {
    const response = await fetch(`${baseUrl}/api/epapers/1`);
    const payload = await response.json();

    assert.equal(payload.data.frame.format, "epd-2bit-v1");
    assert.equal(payload.data.frame.data, frame.data);
    assert.ok(payload.updatedAt);
  } finally {
    await stopServer(server);
  }
});
