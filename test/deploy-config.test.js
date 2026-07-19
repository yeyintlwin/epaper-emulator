const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Docker image includes server helper modules", () => {
  const dockerfile = fs.readFileSync(path.join(__dirname, "..", "Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY epaper-codec\.js/);
  assert.match(dockerfile, /COPY epaper-request-payload\.js/);
});

test("Docker Compose exposes app only on localhost for Nginx proxy", () => {
  const compose = fs.readFileSync(path.join(__dirname, "..", "docker-compose.yml"), "utf8");

  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.doesNotMatch(compose, /caddy:/);
});

test("GitHub Actions deploys from GitHub-hosted runner over SSH", () => {
  const workflow = fs.readFileSync(
    path.join(__dirname, "..", ".github", "workflows", "deploy.yml"),
    "utf8",
  );

  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /LIGHTSAIL_SSH_KEY/);
  assert.match(workflow, /scp -i/);
  assert.match(workflow, /ssh -i/);
  assert.match(workflow, /--exclude='\.env'/);
  assert.doesNotMatch(workflow, /APP_API_KEY|cat > \.env|self-hosted/);
});
