---
name: pwa-development
description: Build or review DCTD storefront service-worker caching, installability, update activation, offline UX, or PWA diagnostics. Use only for PWA behavior under client.
---

# Storefront PWA development

Use `public/sw.js`, `src/components/pwa-registration.tsx`, `src/app/manifest.ts` and `src/pwa/reset-pwa.ts` as the boundary.

1. Classify affected routes A/B/C using the local PWA rule. Default commerce mutations and customer areas to online-only.
2. Add cache behavior only through explicit public allowlists. Exclude API, checkout, payment, account, orders and admin.
3. Keep the worker update prompt and user-confirmed `SKIP_WAITING` activation.
4. Give online-only screens an honest offline state; never queue a mutation without an approved idempotency/conflict design.
5. Keep `/pwa` diagnostics/reset functional and scoped to `dctd-storefront-` caches.
6. Run client tests/build and manually verify install, offline reload, update and reset in a production build.

Read `resources/pr-checklist.md` before handoff.
