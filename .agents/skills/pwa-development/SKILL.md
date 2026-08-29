---
name: pwa-development
description: Build or review storefront PWA behavior, offline UX, service-worker caching, update flow, or installability in client. Use for routes or features whose behavior changes when connectivity or app version changes.
---

# DCTD storefront PWA workflow

Use `client/public/sw.js`, `client/src/components/pwa-registration.tsx`, and `client/src/app/manifest.ts` as the PWA boundary.

1. Classify every route as A online-only, B cached read-only, or C offline-first. Default commerce mutations, checkout, payment, customer account, and admin to A. Contract C requires explicit product approval, an idempotency key, a durable queue, and conflict handling.
2. Keep API, account, checkout, payment, and admin requests network-only. Never add a broad cache rule. Cache only allowlisted public navigation and build assets.
3. Do not persist tokens, payment payloads, customer data, carts containing personal data, or API responses in service-worker caches.
4. Every online-only screen needs a visible offline state. Mutations fail fast while offline and never retry 4xx responses.
5. Preserve the update prompt. New workers wait until the user accepts; `SKIP_WAITING` activates the worker and `controllerchange` reloads an existing client.
6. Keep the `/pwa` diagnostics/reset route working. Reset removes only caches prefixed `dctd-storefront-` and this origin's service-worker registrations.
7. Run `yarn workspace @dctd/client test`, `yarn workspace @dctd/client build`, then manually verify install, offline reload, update, and reset in a production build.

See `resources/pr-checklist.md` before considering a PWA change complete.
