const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..", "..", "..");

test("repository root is the restaurant management system workspace", () => {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");

  assert.equal(rootPackage.name, "restaurant-order-system");
  assert.equal(rootPackage.private, true);
  assert.deepEqual(rootPackage.workspaces, ["apps/*"]);
  assert.match(readme, /Restaurant Management System/);
  assert.match(readme, /apps\/epaper-hub/);
});

test("planned restaurant interfaces have named app folders", () => {
  const appFolders = [
    "epaper-hub",
    "customer-order",
    "kitchen-display",
    "cashier-counter",
    "admin-management",
    "captive-portal",
  ];

  for (const folder of appFolders) {
    assert.ok(fs.existsSync(path.join(repoRoot, "apps", folder, "README.md")));
  }
});
