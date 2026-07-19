# Task 1 Fix Report: Startup E-Paper Readiness Review

## Scope

Fixed all Task 1 review findings in `apps/customer-order` only. No e-paper hub API, SDK, template, persistence, or deployment behavior changed.

## TDD Evidence

### RED

```bash
npm --prefix apps/customer-order test -- test/server.test.js
```

Result: 17 passed, 6 failed. The expected failures showed that 401 and skipped results retried, invalid `attempts` were accepted, missing production configuration ran initialization, and the default listener resolved before `listening` and did not reject asynchronous errors.

```bash
npm --prefix apps/customer-order test -- --test-name-pattern='validation display failure' test/server.test.js
```

Result: 0 passed, 1 failed. The validation failure was retried three times instead of once.

### GREEN

```bash
npm --prefix apps/customer-order test -- --test-name-pattern='validation display failure' test/server.test.js
```

Result: 1 passed, 0 failed.

```bash
npm --prefix apps/customer-order test -- test/server.test.js
```

Result: 24 passed, 0 failed.

```bash
npm --prefix apps/customer-order test
```

Result: 32 passed, 0 failed.

## Changed Files

- `apps/customer-order/server.js`
- `apps/customer-order/test/server.test.js`
- `.superpowers/sdd/task1-fix-report.md`

## Self-Review

- Default `start()` validates `EPAPER_HUB_URL`, `EPAPER_API_KEY` or `API_KEY`, and `ORDER_BASE_URL` before display updates or listening; injected clients bypass process environment validation for tests and callers.
- The production native listener resolves only after its `listening` callback and rejects an asynchronous `error`; injected `listen` functions retain their existing behavior.
- Retries are limited to unknown/network errors, 408, 429, and 5xx. Skipped/configuration results, SDK/template validation errors, and other 4xx errors fail without a retry. The safe table-specific startup error remains the external error surface.
- `attempts` must be a positive integer and is rejected before update work starts.
- No e-paper hub files changed, so the synchronization rule did not require SDK or documentation changes.

## Commit

`Fix Task 1 startup readiness review findings`
