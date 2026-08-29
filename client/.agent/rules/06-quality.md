# Storefront quality rules

- TypeScript must remain strict; minimize client JavaScript and client-component boundaries.
- Test transport error normalization, interactive commerce rules and PWA update/reset behavior when changed.
- Production build is required because App Router and service-worker issues may not appear in development.
- Current storefront production reference is approximately 149 kB First Load JS on `/`; investigate meaningful regressions and new client boundaries.
- Check keyboard interaction, focus, readable errors, responsive layout and image stability.
- Generated code and build output are never patched manually.
