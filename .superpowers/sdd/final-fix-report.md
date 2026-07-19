# Final Review Fix Report

## Scope

Implemented every item in `final-fix-brief.md` without changing the e-paper hub or SDK public APIs.

## Files Changed

- `README.md`
- `apps/customer-order/README.md`
- `apps/customer-order/server.js`
- `apps/customer-order/test/server.test.js`
- `.superpowers/sdd/final-fix-report.md`

## TDD Evidence

### RED

Command:

```bash
npm --prefix apps/customer-order test -- test/server.test.js
```

Result: 8 passed, 3 failed, 0 skipped.

- `provisioning compares SHA-256 token digests with timingSafeEqual` failed because `server.js` compared raw `Buffer` values rather than SHA-256 digests.
- `provisioning rejects noncanonical table number segments` failed because numeric coercion accepted a noncanonical identifier and returned `200` instead of `400`.
- `provisioning rejects active tables without updating the display or session` failed because provisioning returned `200` instead of `409` after an order had made the table active.

### GREEN

Command:

```bash
npm --prefix apps/customer-order test -- test/server.test.js
```

Result: 11 passed, 0 failed, 0 skipped.

The focused tests now verify:

- Active sessions return `409` with `{ "error": "Table is in use" }`, do not call `updateTableWelcome`, and remain unchanged.
- An inactive/default session still maps an SDK failure to the safe `502` body and remains unchanged.
- Only canonical table path identifiers `1` through `12` reach the SDK.
- Both bearer-token values are SHA-256 digests before `crypto.timingSafeEqual` compares them.

## Full Verification

Command:

```bash
npm test
```

Result: 50 passed, 0 failed, 1 skipped (51 total). The skipped e-paper hub persistence test is explicitly marked as unavailable because the local sandbox cannot bind test ports.

Command:

```bash
git diff --check
```

Result: passed with no output.

## Self-Review

- The active-table check reads the stored session after canonical identifier validation and before the Welcome SDK method, so it cannot mutate the session or call the SDK for active tables.
- The SDK-failure response remains the fixed safe `502` payload; raw SDK error text remains absent from this route's HTTP response.
- SHA-256 yields same-size digest buffers, preserving the existing `Bearer ` scheme requirement while avoiding length-dependent comparison behavior.
- The canonical identifier expression accepts exactly `1` through `12`, rejecting all specified numeric spellings and out-of-range values.
- Root and customer-order provisioning documentation now state the separate server-only credential boundary and the checkout requirement for active tables.
- No session-closing behavior, e-paper hub behavior, or SDK public API was added or changed.

## Commit

Commit: `Fix table display provisioning review findings` (single final commit; its resulting hash is recorded in the task completion response).
