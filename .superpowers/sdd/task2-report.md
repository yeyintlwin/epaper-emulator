# Task 2 Report: Docker Compose Runtime Packaging

## Scope

Implemented Task 2 only. The customer-order production image and the e-paper hub Compose deployment now run together. GitHub Actions was not modified.

## TDD Evidence

### RED

```bash
npm --prefix apps/epaper-hub test -- test/deploy-config.test.js
```

Result: 3 passed, 2 failed. The customer deployment assertion failed because `customer-order` was absent from Compose. The image assertion failed with `ENOENT` because `apps/customer-order/Dockerfile` did not exist.

### GREEN

```bash
npm --prefix apps/epaper-hub test -- test/deploy-config.test.js
```

Result: 5 passed, 0 failed.

## Validation

- `npm --prefix apps/epaper-hub test`: 23 passed, 0 failed, 1 skipped because the local sandbox cannot bind test ports.
- `npm --prefix apps/customer-order test`: 32 passed, 0 failed.
- `EPAPER_IMAGE=epaper-hub:test CUSTOMER_ORDER_IMAGE=customer-order:test EPAPER_ENV_FILE=/dev/null docker compose -f apps/epaper-hub/docker-compose.yml config`: passed with `epaper-hub` and `customer-order` services, loopback bindings, health dependency, and private hub URL.
- `docker build -f apps/customer-order/Dockerfile -t customer-order:test .`: passed.

## Implementation

- Added `apps/customer-order/Dockerfile` with the repository-root build context and local SDK runtime install.
- Added hub `/health` probing and the dependent customer-order Compose service with loopback port `3100`, external environment file, private hub URL, public order URL, and restart policy.
- Added deployment configuration assertions.
- Updated deployment documentation for the two-service runtime. No SDK API or implementation changed.
