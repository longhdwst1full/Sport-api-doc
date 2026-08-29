---
name: client-quality-review
description: Review DCTD storefront changes for rendering boundaries, public-contract use, commerce correctness, PWA safety, accessibility, performance, tests, and production behavior.
---

# Storefront quality review

- Confirm client components are limited to actual interaction/browser needs.
- Confirm only public generated operations are consumed and sensitive data is not broadly cached.
- Exercise loading, empty, not-found, error, offline and stale price/stock states.
- Check variant/combo selection, guest identity capture and relevant return constraints.
- Check service-worker allowlists, update activation and reset scope when PWA files changed.
- Check keyboard/focus behavior, responsive layout, image dimensions and production bundle output.
- Run client lint, tests and build.

Report any behavior verified only in development as unverified until the production build is exercised.
