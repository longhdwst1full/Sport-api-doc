# Frontend base review and inheritance decisions

## Sources reviewed

| Source | Useful strengths | Do not inherit directly |
|---|---|---|
| `admin-client` | Application bootstrap, error boundary, route configuration, permissions, feature/list/form discipline | Large Redux/Saga foundation and finance-specific approval behavior before commerce needs it |
| `dragonx-employer-web` | App/core/business/foundation/feature/widget boundaries, lazy routes, typed environment, API generation, PWA lifecycle | Employer/pension business state, token inventory and framework complexity unrelated to commerce |
| `dragon-web-v2` | Foundation components, layout/widgets, route guards, PWA provider/update/reset patterns, OpenAPI generation | Its Vite/Redux runtime cannot be copied into the Next.js storefront unchanged |
| `saletools` commit `b04a5b7` | Domain/application/port/adapter separation, route constants, loadable screens, theme/component wrappers | React 18/Vite 2, Relay, GraphQL, Axios, AntD 4, Material UI 4 and Stitches are legacy/incompatible with the selected base |

GitNexus review sizes at review time: saletools had 5,519 symbols/13,836 relationships/300 flows; dragon-web-v2 had 17,254 symbols/34,649 relationships/300 flows.

## Admin target structure

```text
admin/src
├── app                 # composition, providers, config, boundary, router/navigation
├── core                # authorization and application-wide policies
├── foundation          # reusable admin primitives with no commerce ownership
├── features            # bounded admin capabilities
├── generated/api       # Admin-tagged Orval output only
├── layouts             # admin shells
└── lib                 # transport/framework adapters
```

Implemented base improvements:

- Application error boundary and boot splash.
- Central query retry/mutation policy and Ant Design theme configuration.
- Route-level permission enforcement in addition to menu filtering.
- Shared page-width and query-error foundation primitives.
- Business routes remain lazy-loaded.
- Orval input is restricted to `Admin *` tags and cleans stale generated modules.

Next foundation work should be driven by real features: authenticated identity bootstrap, server pagination/filter URL contract, common form error mapper, and mutation audit/request-ID display. Do not add Redux/Saga until query state and local feature state are demonstrably insufficient.

## Client target structure

```text
client/src
├── app                 # Next.js routes, metadata and route error/loading boundaries
├── features            # catalog, content, reviews, cart, checkout, account
├── foundation          # reusable visual primitives
├── layouts             # storefront shells
├── widgets             # header, footer and composed cross-route blocks
├── generated/api       # Storefront-tagged Orval output only
├── lib                 # transport/framework adapters
├── pwa                 # registration, diagnostics and reset boundary
└── shared              # pure format/config helpers
```

Implemented base improvements:

- Home route reduced to a thin Next.js entry; commerce sections moved to owning features.
- Header, benefits and storefront shell moved to widget/layout boundaries.
- Reusable section heading and VND formatter introduced.
- Loading, not-found and route error screens added.
- Product/content images declare responsive `sizes`.
- Orval input is restricted to `Storefront *` tags and cleans stale admin modules.
- Existing service-worker security behavior remains intact; PWA remains client-only and commerce mutations remain online-only.

Next foundation work should focus on real routes: category/product detail server rendering, cart state without PII persistence, guest identity verification, checkout, account and order history. Do not convert public SEO routes to client-only query rendering by default.

## Contract boundary

The three applications do not share skills, React code or handwritten DTOs. The only cross-application runtime contract is:

```text
NestJS controller/DTO
  -> api/openapi/openapi.json
  -> client Storefront-tag SDK
  -> admin Admin-tag SDK
```

The root Yarn workspace only orchestrates these producer/consumer steps.
