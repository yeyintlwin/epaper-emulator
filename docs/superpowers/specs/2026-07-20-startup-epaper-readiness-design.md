# Startup E-Paper Readiness Design

## Goal

When the restaurant order system starts, all 12 e-paper displays must be ready for customers to order. Every startup deliberately replaces any previous display state with a table-specific `WELCOME` screen and ordering QR code.

## Scope

This change deploys the existing customer-order server beside the e-paper hub and adds a startup bootstrap that provisions displays 1 through 12 through `@restaurant/epaper-hub-sdk`.

Every customer-order startup resets all displays, including displays previously marked `Table is in use`. This is an explicit operational choice for the current in-memory system. Persistent table-session recovery is outside this change.

## Runtime Architecture

Docker Compose will run two services:

- `epaper-hub` stores and serves the 12 e-paper frames.
- `customer-order` serves the mobile ordering application and initializes all displays before accepting customer traffic.

The customer-order container will call the hub over Docker's private network at `http://epaper-hub:3000`. It will publish port 3100 only on `127.0.0.1` for the host Nginx reverse proxy. The public ordering URL embedded in every QR code is `https://order.yeyintlwin.com`.

Docker Compose will start `customer-order` after the e-paper hub health check reports healthy. The startup bootstrap will still retry hub updates because service readiness and transient request failures can race.

## Startup Flow

1. Load server-only environment variables.
2. Create the e-paper SDK client.
3. Render and submit `WELCOME`, table number, and ordering QR frames for table IDs 1 through 12.
4. Run updates concurrently with a bounded retry policy for transient failures.
5. Start the customer-order HTTP listener only after all 12 updates succeed.
6. If any display cannot be initialized after all retries, log a safe table-specific error and exit non-zero. Docker's `restart: unless-stopped` policy will restart the service and retry the complete bootstrap.

The startup operation is idempotent: retrying renders the same current `WELCOME` frame for each table.

## Configuration And Security

The external file `~/restaurant-order-system.env` remains the only runtime environment file. It supplies:

- `API_KEY` for the e-paper hub.
- `EPAPER_API_KEY` for the customer-order SDK, or the existing `API_KEY` fallback.
- `EPAPER_HUB_URL=http://epaper-hub:3000` inside Docker.
- `ORDER_BASE_URL=https://order.yeyintlwin.com`.
- `TABLE_DISPLAY_API_KEY` for the protected manual provisioning endpoint.

No API key is included in browser assets or `/api/config`. GitHub Actions does not print or recreate the environment file.

## Deployment

Add a production Dockerfile for `apps/customer-order` that includes the local SDK package and its runtime dependency. Extend the existing Compose file with the customer-order service, hub health check, internal dependency, loopback port binding, shared external environment file, and restart policy.

GitHub Actions will build and upload both Docker images plus the single Compose file. The server folder remains minimal: `docker-compose.yml` and optional `config/`; the environment file stays one level above it.

Nginx must route `order.yeyintlwin.com` to `127.0.0.1:3100` with HTTPS. The existing `epaper-hub.yeyintlwin.com` route remains unchanged.

## Failure Behavior

- Missing hub URL, API key, or ordering base URL is a startup configuration error and exits non-zero.
- A failed table update is retried with a short bounded delay.
- Exhausted retries prevent the HTTP listener from starting and identify the failed table without exposing credentials or raw sensitive request data.
- Manual provisioning and first-order status updates keep their existing HTTP contracts.

## Testing

Automated tests will verify:

- Startup provisions exactly tables 1 through 12 with `WELCOME` and the correct QR URL.
- Startup waits for all display updates before listening.
- A transient update failure is retried.
- An exhausted failure prevents listening and returns a rejected startup result.
- Docker Compose includes both services, private hub communication, health dependency, loopback bindings, and the external environment file.
- GitHub Actions builds, transfers, loads, and starts both images.
- Public assets and `/api/config` expose no secrets.
- README and SDK-related documentation describe automatic startup initialization.
- The complete repository test suite passes.

## Deferred Work

Persistent active-session recovery and avoiding active-table resets belong to the future cashier checkout/session lifecycle. Until that exists, every customer-order restart intentionally resets all 12 displays to `WELCOME`.
