# Storefront directory structure

- `src/app`: routes, layouts, metadata, manifest and route-level composition.
- `src/features/<feature>`: add this boundary when a commerce capability grows beyond a small route section.
- `src/components`: reusable presentation or application shell components, not feature-specific API orchestration.
- `src/lib`: framework and transport adapters.
- `src/pwa`: client-side PWA utilities; the service worker entry remains in `public/sw.js`.
- `src/generated/api`: disposable Orval output; never hand edit.

Do not create a generic shared layer that mixes cart, customer, catalog and checkout policy. Keep commerce decisions with their owning feature.
