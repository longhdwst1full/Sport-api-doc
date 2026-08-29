# Storefront PWA security and caching

Classify each route:

- A: online-only.
- B: cached public read-only.
- C: offline-first mutation, allowed only after explicit product design for queueing, idempotency and conflict resolution.

Checkout, payment, account, profile, customer addresses, orders/history and all API calls default to A. Public shell/assets and explicitly allowlisted public pages may be B.

- Never cache tokens, cookies, payment payloads, customer PII, personalized HTML or authenticated API responses.
- Never use broad destination-based runtime caching.
- Cache names are storefront-prefixed and versioned.
- Install/activate/reset cleanup may delete only cache names prefixed `dctd-storefront-`; never delete every cache on the origin. The current worker activation cleanup is a known gap until it is prefix-scoped.
- The current worker allowlists `/`, `/_next/static/*`, `/icon.svg` and `/manifest.webmanifest`; expanding this set requires an explicit route-level review.
- A waiting service worker activates only after user confirmation.
- `/pwa` diagnostics/reset must remove only this application's caches and registrations.
