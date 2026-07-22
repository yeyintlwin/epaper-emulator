# Secure Table QR And Multi-Phone Session Design

## Goal

Prevent a photographed e-paper QR code from creating phantom orders after a table visit ends, while allowing two or more customers at the same table to order from separate phones over either restaurant Wi-Fi or mobile data.

## Security Model

The QR code will contain a short, meaningless, cryptographically random table-visit token. It will not expose the shop ID, business date, table number, generation, or validity period. Those fields are stored and validated server-side.

The QR token is a bearer credential. Anyone holding the current token can join the current table visit until checkout or safety expiry. This is an accepted limitation because mobile-data ordering is required and no additional proximity hardware is available. The protection boundary is therefore visit termination: checkout immediately invalidates photographs from the completed visit.

The server must never authorize an order from a client-supplied table number. It derives the table and visit exclusively from a validated phone session.

## QR Format

Generate tokens with `crypto.randomBytes(16).toString("base64url")`, producing a 128-bit, 22-character identifier. The e-paper encodes this URL:

```text
https://order.yeyintlwin.com/t/<22-character-token>
```

The complete production URL is 53 characters and remains concise enough for the existing 296x128 QR area. The SDK's QR fit validation remains authoritative and must be covered by an exact production-length test.

Only a SHA-256 hash of the token is used as the lookup key. The raw token is retained only in private process memory so the current QR can be rendered again when its status changes. Logs must never contain the raw QR token, phone session ID, authorization headers, or cookies.

## Server-Side Table Visit

Each table has one current visit record:

```text
shopId: configured SHOP_ID
businessDate: YYYY-MM-DD in Asia/Tokyo using a 06:00 rollover
tableNumber: integer 1 through 12
generation: monotonically increasing integer for that table
tokenHash: SHA-256 of the current QR token
status: welcome | in_use | closed
expiresAt: next business-day rollover
slipNumber: null until the first order
orders: all orders for the visit
totals: current monetary totals
```

For the current in-memory milestone, the visit and phone-session stores live in the customer-order process. A restart intentionally invalidates all prior tokens and sessions, creates a fresh visit for each of the 12 tables, and updates all e-paper screens before accepting traffic. Persistent restaurant data remains future database work.

`SHOP_ID` is a required concise server identifier. Production initially uses `SHOP_ID=1`.

## Startup Flow

1. Validate `SHOP_ID`, `ORDER_BASE_URL`, e-paper hub credentials, and existing startup configuration.
2. Create a fresh generation and random QR token for tables 1 through 12.
3. Send each table's `WELCOME`, table number, and opaque ordering URL through `@restaurant/epaper-hub-sdk`.
4. Begin listening only after all 12 updates succeed.

The raw token remains only in private process memory while that visit is active so status updates can preserve the current QR. Restarting the service makes every previously photographed URL invalid.

## Phone Enrollment

`GET /t/:token` performs strict token-shape validation, hashes the token, and resolves an active, unexpired visit by its fixed-length hash lookup key.

On success it creates a separate 128-bit random phone session for that browser, stores its hash with the visit reference, and returns:

```http
Set-Cookie: rsid=<session>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=<seconds-until-business-rollover>
Location: /
Cache-Control: no-store
```

Multiple phones may redeem the same active table token. Each receives a different phone session mapped to the same visit and therefore the same table, slip number, order history, and totals.

An invalid, expired, closed, or superseded token returns a safe `410` response instructing the customer to scan the current table QR. It does not reveal whether the token ever existed.

## Authorized Customer APIs

The following customer operations require a valid `rsid` cookie:

- `GET /api/session`
- `POST /api/orders`
- `POST /api/staff-calls`

These endpoints derive `tableNumber` and visit identity from the server-side phone session. They ignore or reject `table`, `table_number`, shop, date, generation, and slip identifiers supplied by the browser.

The menu and health endpoints remain public. API responses containing visit data use `Cache-Control: no-store`.

Mutating customer APIs accept only `application/json` and require an `Origin` header matching the configured `ORDER_BASE_URL`. Together with `SameSite=Lax`, this blocks cross-site form and script requests from spending an enrolled phone session.

The first order changes the visit to `in_use`, creates one slip number, and updates the e-paper status while preserving the current QR token. Later orders from every enrolled phone use that same visit and slip number.

## Checkout And Rotation

Payment confirmation from the future cashier service calls:

```http
POST /api/tables/:tableNumber/checkout
Authorization: Bearer <CHECKOUT_API_KEY>
```

`CHECKOUT_API_KEY` is a separate server-only credential checked using the existing fixed-size SHA-256 digest and `crypto.timingSafeEqual` pattern. It is never exposed to browser code.

Checkout is serialized with same-table order and e-paper operations. A successful checkout performs one atomic logical transition:

1. Validate that the requested table has an active visit.
2. Mark the visit closed and invalidate its QR token.
3. Invalidate every phone session attached to that visit.
4. Create a new `welcome` visit with the next generation and a new random QR token.
5. Update the e-paper to `WELCOME` with the new QR.
6. Return success only after the e-paper update succeeds.

If the e-paper update fails, the old visit remains closed and unusable. The new visit remains pending and checkout returns a safe `502`; a protected retry of the same checkout completes the pending display update without generating another token. This prevents payment success from leaving the old photographed QR valid.

After successful checkout, requests using old phone sessions return `401`, and the old QR returns `410`.

## Business-Day Safety Expiry

Business dates use `Asia/Tokyo` with a 06:00 rollover. A visit that reaches the next rollover without checkout is invalidated before accepting further enrollment or customer API requests.

The customer-order process schedules the next rollover. At 06:00 it serializes each table transition, invalidates the expired visit and phone sessions, creates a fresh visit, and updates the e-paper to `WELCOME` with the new QR. A failed e-paper update remains pending and is retried without generating another token. Startup performs the same reconciliation before listening. An operational event is logged using shop ID, table number, business date, generation, and event type, without raw credentials. Automatic expiry is a safety fallback, not a substitute for cashier checkout.

## Frontend Flow

The customer page no longer reads `table` or `table_number` from the URL. After QR enrollment redirects to `/`, it loads the current visit through authenticated `/api/session`.

If enrollment or a later API call reports an expired session, the UI shows a concise rescan-required screen and does not allow ordering, staff calls, or checkout preview against a guessed table.

## Configuration

Add these server-only values to the external Lightsail environment file:

```dotenv
SHOP_ID=1
CHECKOUT_API_KEY=<independent-random-secret>
BUSINESS_TIME_ZONE=Asia/Tokyo
BUSINESS_DAY_ROLLOVER_HOUR=6
```

`CHECKOUT_API_KEY` must be independent from `API_KEY`, `EPAPER_API_KEY`, and `TABLE_DISPLAY_API_KEY`. Docker Compose may set the non-secret timezone and rollover defaults, but credentials remain in `~/restaurant-order-system.env`.

## E-Paper SDK Contract

The SDK continues to accept an exact URL. Its API shape does not change, but customer-order now passes opaque `/t/:token` URLs instead of `?table=N` URLs.

Because e-paper integration behavior and templates are affected, update SDK tests and the root, hub, SDK, and customer-order documentation in the same change according to `AGENTS.md`.

## Error Handling

- Malformed QR token: `410`, generic rescan message.
- Unknown, closed, expired, or superseded QR token: `410`, same generic message.
- Missing or invalid phone session: `401`, generic rescan message.
- Invalid checkout authorization: `401`.
- Invalid checkout table ID: `400`.
- No active or pending visit for checkout: `409`.
- E-paper checkout rotation failure: safe `502`, pending rotation retained for retry.
- Configuration failure: startup exits non-zero before listening.

No response includes raw token values, session IDs, key values, internal hashes, or underlying SDK error text.

## Testing

Automated tests will verify:

- Generated tokens contain 128 bits from a CSPRNG and use exactly 22 Base64URL characters.
- The production-length opaque URL fits the existing e-paper QR area.
- Startup creates 12 unique tokens and correct server records before listening.
- QR enrollment sets secure cookie attributes and never places table data in the redirected URL.
- Two or more phones join one table visit and share its slip, orders, and totals.
- Customer APIs reject missing, forged, expired, closed, and cross-table sessions.
- Client-supplied table fields cannot redirect an order to another table.
- Checkout revokes the old QR and every enrolled phone session.
- Checkout creates a distinct token and updates the correct e-paper.
- Checkout retry after an e-paper failure reuses the pending token.
- Business-day rollover invalidates abandoned visits at 06:00 Asia/Tokyo.
- Startup restart invalidates all prior tokens and creates 12 new ones.
- Browser assets and public APIs contain no credentials.
- Repository-level tests, Docker configuration tests, and CI/CD tests pass.

## Deferred Work

- Persistent database-backed visits, orders, transactions, and audit history.
- Cashier UI and payment-provider integration; this change exposes the protected payment-completion contract they will call.
- Strong proof of physical presence during an active visit. With mobile-data ordering and a shared static visit QR, someone receiving a photograph before checkout can still join that active visit. Checkout, restart, and business-day expiry terminate that capability.
