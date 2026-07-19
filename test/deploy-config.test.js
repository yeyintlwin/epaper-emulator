const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Docker image includes server helper modules", () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, "..", "Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY epaper-codec\.js/);
  assert.match(dockerfile, /COPY epaper-request-payload\.js/);
  assert.match(dockerfile, /COPY screen-store\.js/);
});

test("Docker Compose exposes app only on localhost for Nginx proxy", () => {
  const compose = fs.readFileSync(path.join(__dirname, "..", "docker-compose.yml"), "utf8");

  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(compose, /\$\{EPAPER_IMAGE:-epaper-emulator\}/);
  assert.match(compose, /\$\{EPAPER_ENV_FILE:-\.env\}/);
  assert.match(compose, /SCREEN_STORE_FILE: \/data\/screens\.json/);
  assert.match(compose, /epaper-data:\/data/);
  assert.match(compose, /^volumes:\n  epaper-data:/m);
  assert.doesNotMatch(compose, /caddy:/);
});

test("GitHub Actions deploys from GitHub-hosted runner over SSH", () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "deploy.yml"),
    "utf8",
  );

  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /LIGHTSAIL_SSH_KEY/);
  assert.match(workflow, /docker build -t epaper-emulator:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /docker save epaper-emulator:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /docker load -i \/tmp\/epaper-emulator-image\.tgz/);
  assert.match(workflow, /scp -i/);
  assert.match(workflow, /ssh -i/);
  assert.match(workflow, /EPAPER_ENV_FILE=\.\.\/epaper-emulator\.env/);
  assert.match(workflow, /find ~\/epaper-emulator -mindepth 1 -maxdepth 1/);
  assert.doesNotMatch(workflow, /app\.tgz|tar -xzf|APP_API_KEY|cat > \.env|self-hosted/);
});
