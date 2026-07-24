# Full-Screen Block For Missing And Invalid Table Sessions — Design

**Goal:** When a customer opens the ordering app without a usable table session, show a clear full-screen message and prevent ordering, instead of the current behavior (a small overlay message on top of a live menu, or raw `410` JSON for a dead QR link).

**Scope:** `apps/customer-order` only — one server route branch, the SPA bootstrap, one new full-screen UI state, and the tests and docs that describe them. No change to the table-visit store, order store, checkout, e-paper integration, or the multi-phone enrollment behavior.

## Behavior

Three entry paths collapse into two messages:

| Situation | How it is reached | Message |
| --- | --- | --- |
| No session at all | Open `/` directly, or the `rsid` cookie is missing/expired on first load | **"Scan your table's QR code to start ordering."** (`reason = missing`) |
| Invalid / expired / rotated QR | Open `/t/<token>` where the token is malformed, unknown, expired, or already rotated (e.g. after checkout) | **"This QR code is no longer valid. Scan the current QR code at your table."** (`reason = invalid`) |
| Session revoked mid-use | The app was working, then checkout or the 06:00 rollover revoked the session, so the next protected API call returns `401`/`410` | Same `invalid` message |

In every blocked state the entire ordering UI (menu, order bucket, history, staff, checkout, bottom navigation) is hidden. There is no actionable control on the block screen — the only way forward is to physically scan the current table QR.

## Server change (`apps/customer-order/server.js`)

The `GET /t/:token` route today has two outcomes: a valid token → `302` to `/` with the `rsid` cookie; an unusable token → `410` with JSON body `{"error":"Table visit is no longer available"}`.

Change **only the unusable-token branch** to a redirect:

- Unusable token → `302` with `Location: /?e=expired`, `Cache-Control: no-store`, and **no `Set-Cookie`**.
- Valid token → unchanged (`302` to `/`, sets the `rsid` cookie).

This is the chosen "Approach A". Consequences:

- The `410`/`{"error":"Table visit is no longer available"}` response for `/t/<dead>` no longer exists; all callers (browser or API) now receive the `302` to `/?e=expired`. The malformed, unknown, expired, and superseded token cases stay indistinguishable from each other.
- `/?e=expired` is a harmless, shareable URL that always renders the `invalid` block. No token or session data is carried in it.

No other server route changes. `GET /api/session`, `POST /api/orders`, and `POST /api/staff-calls` keep returning `401 {"error":"Scan the current table QR to continue"}` for a missing/forged/revoked cookie.

## Client change (`apps/customer-order/public/`)

**`index.html`** — add one full-screen element, `#blockScreen`, containing a QR-style inline-SVG icon, a heading element, and a message element. It is hidden by default. Remove the small `#rescanMessage` panel (its role is replaced by the block screen).

**`styles.css`** — a single `blocked` class on `<html>` (or `<body>`) hides `.appShell` and `.bottomNav` and reveals `#blockScreen` as a full-viewport, opaque, centered layout. `#blockScreen` is `display:none` unless the `blocked` class is present.

**`app.js`** — introduce one function, `showBlockScreen(reason)`, where `reason` is `"missing"` or `"invalid"`. It sets the heading and message text for that reason, adds the `blocked` class, and leaves the app shell hidden. Wire it in three places:

1. On load, read the `e` query parameter. If it equals `expired`, call `showBlockScreen("invalid")` and skip the normal `init()` fetches.
2. Otherwise run `init()`. If `/api/session` returns `401`, call `showBlockScreen("missing")`.
3. After a successful `init()`, any protected API call (`api()` helper) that returns `401` or `410` calls `showBlockScreen("invalid")` — this replaces the current `requireRescan()`.

The two message strings live in one place (a small map keyed by `reason`), so the block screen is a single component with two texts.

## Error handling

- Query-parameter parsing is tolerant: any `e` value other than `expired` is ignored and the app proceeds to the normal `init()` path.
- The block screen removes the ordering UI from the layout, so no order or staff request can be issued while blocked; there is nothing to re-enable until a fresh scan reloads the page.

## Testing

**`apps/customer-order/test/server.test.js`**
- Malformed, unknown, expired, and superseded tokens on `GET /t/:token` all return `302` with `Location: /?e=expired`, `Cache-Control: no-store`, and no `Set-Cookie`.
- A valid token still returns `302` to `/` with the `rsid` cookie (regression guard, unchanged behavior).

**`apps/customer-order/test/public-ui.test.js`**
- `index.html` contains `#blockScreen` and both exact message strings.
- `app.js`: `e=expired` on load renders the `invalid` message and does not call `/api/session`; a `401` from `/api/session` on load renders the `missing` message; a `401`/`410` from a protected call after init renders the `invalid` message; in every blocked state `.appShell`/`.bottomNav` are hidden (the `blocked` class is set).

## Documentation to update

- `README.md` and `apps/customer-order/README.md` — the enrollment/lifecycle sections currently state that a dead `/t/<token>` returns `410 {"error":"Table visit is no longer available"}`. Update them to describe the `302` to `/?e=expired` and the two full-screen block messages.
- `apps/epaper-hub/test/deploy-config.test.js` — the secure-QR lifecycle assertions currently require the docs to contain `410` and `Table visit is no longer available`. Update those assertions to match the new redirect/block contract.

## Out of scope

- Internationalization of the two messages (the app is English-only for this milestone).
- Any change to how valid multi-phone enrollment, ordering, checkout, or the e-paper displays work.
- Making the token portable across browsers (previously discussed and declined — each phone scans the physical QR).
