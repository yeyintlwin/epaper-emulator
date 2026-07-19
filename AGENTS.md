# Project Instructions

## E-paper Hub Synchronization

Whenever `apps/epaper-hub` changes, check whether the change affects its API contract, authentication, endpoints, payload codec, screen dimensions or colors, templates, persistence, or deployment behavior. If it does:

- Update `packages/epaper-hub-sdk` implementation and tests in the same change.
- Update the relevant documentation in the root `README.md`, `apps/epaper-hub/README.md`, and `packages/epaper-hub-sdk/README.md`.
- Run the repository-level `npm test` before considering the change complete.

