# Storefront directory structure

- `src/app`: routes, layouts, metadata, manifest and route-level composition.
- `src/features/<feature>`: commerce/content capability UI and orchestration, including the current `home`, `catalog`, `content` and `reviews` slices.
- `src/layouts`: route shells; `src/widgets`: reusable page sections; `src/foundation`: low-level presentation; `src/shared`: small domain-neutral utilities.
- `src/components`: compatibility/leaf components only; new feature orchestration does not belong here.
- `src/app/store`: storefront Redux composition; feature slices stay narrowly client-owned.
- `src/lib`: framework and transport adapters.
- `src/pwa`: client-side PWA utilities; the service worker entry remains in `public/sw.js`.
- `src/generated/api`: disposable Orval output; never hand edit.

Dependencies flow from route/layout composition toward widgets/features, then foundation/shared/lib. Do not create a generic shared layer that mixes cart, customer, catalog and checkout policy.

Preferred storefront flow, adapted from `dragon-web-v2` and `dragonx-employer-web` for Next.js:

`server-first route -> feature composition -> narrow client hook/island -> public generated SDK -> widget/foundation UI`.

Feature modules own API-to-view mapping and commerce decisions. Route files remain thin; generated code remains disposable transport code. Do not copy the reference Vite apps' global client-store flow into public Next.js routes.
