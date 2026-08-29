# Storefront PWA security and caching

Classify each route:

- A: online-only.
- B: cached public read-only.
- C: offline-first mutation, allowed only after explicit product design for queueing, idempotency and conflict resolution.

Checkout, payment, account, profile, addresses, order history and all API calls default to A. Public shell/assets and explicitly allowlisted public pages may be B.

- Never cache tokens, cookies, payment payloads, customer PII, personalized HTML or authenticated API responses.
- Never use broad destination-based runtime caching.
- Cache names are storefront-prefixed and versioned.
- A waiting service worker activates only after user confirmation.
- `/pwa` diagnostics/reset must remove only this application's caches and registrations.
