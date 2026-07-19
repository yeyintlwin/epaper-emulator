# Second-Wave Final Fix Report

## Scope

Implemented all three second-wave findings without changing the e-paper hub API, SDK public API, order-store session model, or adding checkout/session-close behavior.

## Files Changed

- `README.md`
- `apps/customer-order/README.md`
- `apps/customer-order/server.js`
- `apps/customer-order/test/server.test.js`
- `docs/superpowers/plans/2026-07-20-sdk-table-entry.md`
- `docs/superpowers/specs/2026-07-20-sdk-table-entry-design.md`
- `.superpowers/sdd/second-final-fix-report.md`

## TDD Evidence

### RED

Command:

```bash
npm --prefix apps/customer-order test -- --test-name-pattern='concurrent first order' test/server.test.js
```

Result before the coordinator: 0 passed, 1 failed. The controlled race produced display updates in the stale order:

```text
actual: [ 'Table is in use', 'Welcome' ]
expected: [ 'Welcome', 'Table is in use' ]
```

The test blocks the Welcome SDK update, lets the first order complete its display update, then releases the older Welcome update. This reproduces the incorrect final e-paper state deterministically.

### GREEN

Command:

```bash
npm --prefix apps/customer-order test -- --test-name-pattern='concurrent first order|configured token length' test/server.test.js
```

Result: 2 passed, 0 failed.

- The keyed display-update chain serializes only work for the same table. Welcome rechecks session state inside that chain, and first-order `Table is in use` updates use the same chain, so the final display agrees with the active session.
- The behavioral security test rejects `Bearer display-secrEt`, which is the same length as the configured token, without calling the Welcome update. The existing SHA-256 and `timingSafeEqual` source assertion remains.

## Full Verification

Command:

```bash
npm --prefix apps/customer-order test
```

Result: 21 passed, 0 failed, 0 skipped.

Command:

```bash
npm test
```

Result: 53 passed, 0 failed, 1 skipped (54 total). The skipped e-paper hub restart-persistence test is explicitly skipped because the local sandbox cannot bind test ports.

Command:

```bash
git diff --check
```

Result: passed with no output.

## Contract Review

- The design, implementation plan, root README, and customer README now state that this route provisions only inactive tables.
- Active tables return `409` with `Table is in use`; the route never resets an active table.
- Session closure is explicitly out of scope and assigned to the future cashier checkout/session lifecycle. No checkout or session-close API was introduced.

## Self-Review

- `tableDisplayUpdates` is a `Map` keyed by table number, so unrelated tables do not wait on one another.
- The Welcome session-state check occurs after earlier same-table display work and before the Welcome SDK call; a first order that occurs first prevents Welcome with `409`.
- When Welcome has already begun, the first-order display update waits behind it and writes `Table is in use` last, matching the active order session.
- Failed display work does not poison the next queued update because the next operation continues after a rejected predecessor.
- The token comparison remains fixed-size SHA-256 digest comparison using `crypto.timingSafeEqual`, and now has behavior coverage for an equal-length incorrect token.

## Commit

`Fix second-wave table display review findings`
