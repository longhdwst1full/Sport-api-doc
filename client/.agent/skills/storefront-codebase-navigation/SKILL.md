---
name: storefront-codebase-navigation
description: Explore DCTD storefront architecture, rendering boundaries, PWA flows, generated API use, or frontend change impact. Use only under client.
---

# Storefront codebase navigation

1. Check GitNexus index freshness and search the user journey or PWA flow by concept.
2. Inspect symbol context and upstream impact before editing existing behavior; report direct dependents, affected flows and risk.
3. Use `rg --files` for file discovery and `rg` for exact route, cache name, operation ID or component names. Avoid reading all generated SDK files.
4. Trace server/client boundaries, generated query data, Redux interaction state and service-worker caching separately.
5. Run focused tests, then storefront lint/test/production build and GitNexus change detection.

Protect the server-component default and do not import admin UI, editors or backend source.
