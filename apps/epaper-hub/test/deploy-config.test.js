const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appRoot = path.join(__dirname, "..");
const repoRoot = path.join(appRoot, "..", "..");

test("Docker image includes server helper modules", () => {
  const dockerfile = fs.readFileSync(path.join(appRoot, "Dockerfile"), "utf8");

  assert.match(dockerfile, /COPY epaper-codec\.js/);
  assert.match(dockerfile, /COPY epaper-request-payload\.js/);
  assert.match(dockerfile, /COPY screen-store\.js/);
});

test("Docker Compose exposes app only on localhost for Nginx proxy", () => {
  const compose = fs.readFileSync(path.join(appRoot, "docker-compose.yml"), "utf8");

  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(compose, /epaper-hub:/);
  assert.match(compose, /\$\{EPAPER_IMAGE:-epaper-hub\}/);
  assert.match(compose, /container_name: epaper-hub/);
  assert.match(compose, /\$\{EPAPER_ENV_FILE:-\.env\}/);
  assert.match(compose, /SCREEN_STORE_FILE: \/data\/screens\.json/);
  assert.match(compose, /epaper-data:\/data/);
  assert.match(compose, /^volumes:\n  epaper-data:/m);
  assert.doesNotMatch(compose, /caddy:/);
});

test("Docker Compose starts customer ordering after a healthy e-paper hub", () => {
  const compose = fs.readFileSync(path.join(appRoot, "docker-compose.yml"), "utf8");

  assert.match(compose, /customer-order:/);
  assert.match(compose, /image: \$\{CUSTOMER_ORDER_IMAGE:-customer-order\}/);
  assert.match(compose, /127\.0\.0\.1:3100:3100/);
  assert.match(compose, /EPAPER_HUB_URL: http:\/\/epaper-hub:3000/);
  assert.match(compose, /ORDER_BASE_URL: https:\/\/order\.yeyintlwin\.com/);
  assert.match(compose, /BUSINESS_TIME_ZONE: Asia\/Tokyo/);
  assert.match(compose, /BUSINESS_DAY_ROLLOVER_HOUR: 6/);
  assert.doesNotMatch(compose, /^\s+(?:SHOP_ID|CHECKOUT_API_KEY):/m);
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /wget.*http:\/\/localhost:3000\/health/);
});

test("customer environment example documents rollover configuration and server-only secrets", () => {
  const environment = fs.readFileSync(path.join(repoRoot, "apps", "customer-order", ".env.example"), "utf8");

  assert.match(environment, /^SHOP_ID=1$/m);
  assert.match(environment, /^CHECKOUT_API_KEY=replace-with-independent-random-secret$/m);
  assert.match(environment, /^BUSINESS_TIME_ZONE=Asia\/Tokyo$/m);
  assert.match(environment, /^BUSINESS_DAY_ROLLOVER_HOUR=6$/m);
});

test("Customer order Docker image includes its local SDK runtime dependency", () => {
  const dockerfile = fs.readFileSync(
    path.join(repoRoot, "apps", "customer-order", "Dockerfile"),
    "utf8",
  );

  assert.match(dockerfile, /FROM node:20-alpine/);
  assert.match(dockerfile, /COPY packages\/epaper-hub-sdk \.\/packages\/epaper-hub-sdk/);
  assert.match(dockerfile, /COPY apps\/customer-order \.\/apps\/customer-order/);
  assert.match(dockerfile, /npm --prefix packages\/epaper-hub-sdk install --omit=dev/);
  assert.match(dockerfile, /npm --prefix apps\/customer-order install --omit=dev --workspaces=false/);
  assert.match(dockerfile, /EXPOSE 3100/);
  assert.match(dockerfile, /CMD \["node", "apps\/customer-order\/server\.js"\]/);
});

test("operations docs describe automatic twelve-table startup readiness", () => {
  const rootReadme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const customerReadme = fs.readFileSync(path.join(repoRoot, "apps", "customer-order", "README.md"), "utf8");
  const hubReadme = fs.readFileSync(path.join(repoRoot, "apps", "epaper-hub", "README.md"), "utf8");
  const sdkReadme = fs.readFileSync(path.join(repoRoot, "packages", "epaper-hub-sdk", "README.md"), "utf8");
  const infraReadme = fs.readFileSync(path.join(repoRoot, "infra", "README.md"), "utf8");
  const priorSpec = fs.readFileSync(path.join(repoRoot, "docs", "superpowers", "specs", "2026-07-20-sdk-table-entry-design.md"), "utf8");
  const priorPlan = fs.readFileSync(path.join(repoRoot, "docs", "superpowers", "plans", "2026-07-20-sdk-table-entry.md"), "utf8");
  const docs = [rootReadme, customerReadme, hubReadme, sdkReadme, infraReadme, priorSpec, priorPlan].join("\n");

  assert.match(rootReadme, /resets all 12 displays.*before accepting traffic/i);
  assert.match(customerReadme, /resets all 12 displays.*before accepting traffic/i);
  assert.match(docs, /EPAPER_HUB_URL=http:\/\/epaper-hub:3000/);
  assert.match(docs, /order\.yeyintlwin\.com/);
  assert.match(docs, /127\.0\.0\.1:3100/);
  assert.doesNotMatch(docs, /server startup does not reset displays|startup is intentionally excluded|must not automatically reset displays|next deployment task/i);
});

test("GitHub Actions deploys from GitHub-hosted runner over SSH", () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, ".github", "workflows", "deploy.yml"),
    "utf8",
  );

  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /LIGHTSAIL_SSH_KEY/);
  assert.match(workflow, /npm --prefix apps\/epaper-hub ci/);
  assert.match(workflow, /npm --prefix apps\/epaper-hub test/);
  assert.match(workflow, /npm --prefix packages\/epaper-hub-sdk ci/);
  assert.match(workflow, /npm --prefix packages\/epaper-hub-sdk test/);
  assert.match(workflow, /npm --prefix apps\/customer-order ci/);
  assert.match(workflow, /npm --prefix apps\/customer-order test/);
  assert.doesNotMatch(workflow, /working-directory: apps\/epaper-hub/);
  assert.match(workflow, /docker build -t epaper-hub:\$\{\{ github\.sha \}\} apps\/epaper-hub/);
  assert.match(workflow, /docker save epaper-hub:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /docker build -f apps\/customer-order\/Dockerfile -t customer-order:\$\{\{ github\.sha \}\} \./);
  assert.match(workflow, /docker save customer-order:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /customer-order-image\.tgz/);
  assert.match(workflow, /docker load -i \/tmp\/epaper-hub-image\.tgz/);
  assert.match(workflow, /docker load -i \/tmp\/customer-order-image\.tgz/);
  assert.match(workflow, /scp -i/);
  assert.match(workflow, /apps\/epaper-hub\/docker-compose\.yml/);
  assert.match(workflow, /ssh -i/);
  assert.match(workflow, /~\/restaurant-order-system/);
  assert.match(workflow, /restaurant-order-system\.env/);
  assert.match(workflow, /docker compose down \|\| docker stop epaper-emulator \|\| true/);
  assert.match(workflow, /docker volume create restaurant-order-system_epaper-data/);
  assert.match(workflow, /epaper-emulator_epaper-data/);
  assert.match(workflow, /EPAPER_ENV_FILE=\.\.\/restaurant-order-system\.env/);
  assert.match(workflow, /CUSTOMER_ORDER_IMAGE=customer-order:\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /find ~\/restaurant-order-system -mindepth 1 -maxdepth 1/);
  assert.doesNotMatch(workflow, /docker build -t epaper-hub:\$\{\{ github\.sha \}\} \./);
  assert.doesNotMatch(workflow, /app\.tgz|tar -xzf|APP_API_KEY|cat > \.env|self-hosted/);
});
