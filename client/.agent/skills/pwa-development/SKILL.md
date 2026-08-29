---
name: pwa-development
description: Build or review DCTD storefront service-worker caching, installability, update activation, offline UX, or PWA diagnostics. Use only for PWA behavior under client.
---

# Storefront PWA development

Use `public/sw.js`, the public entry `src/pwa/pwa-registration.tsx`, its current implementation `src/components/pwa-registration.tsx`, `src/app/manifest.ts`, `src/app/pwa/page.tsx` and `src/pwa/reset-pwa.ts` as the boundary.

1. Classify affected routes A/B/C using the local PWA rule. Default commerce mutations and customer areas to online-only.
2. Add cache behavior only through explicit public allowlists. Keep API, checkout, payment, account/customer, orders/history and admin online-only.
3. Keep the worker update prompt and user-confirmed `SKIP_WAITING` activation.
4. Give online-only screens an honest offline state; never queue a mutation without an approved idempotency/conflict design.
5. Keep `/pwa` diagnostics/reset functional and scoped to `dctd-storefront-` caches.
6. Increment the storefront cache version when cached asset semantics change. Run client tests/build and manually verify install, offline reload, update and reset in a production build.

Read `resources/pr-checklist.md` before handoff.
