# Storefront PWA security

- API, checkout, payment, account, profile, order history and admin are network-only.
- Service-worker caches use public allowlists; broad destination-based caching is forbidden.
- Offline contracts are A online-only, B cached read-only, or C offline-first. C requires explicit design for idempotency, sync and conflicts.
- A waiting worker activates only after user confirmation. Keep update, offline and reset UX functional.
- Never cache or persist bearer tokens, payment data or customer PII.
