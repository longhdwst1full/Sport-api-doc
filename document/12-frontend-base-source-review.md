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
- Luồng ưu tiên kế thừa từ `admin-client` và `dragonx-employer-web`: route/navigation → page mỏng → feature hook/mapping → generated SDK hoặc workflow state → foundation UI. Component không gọi Axios trực tiếp và generated code không chứa logic hiển thị.
- State decision được giữ rõ: TanStack Query cho server state; Redux/Saga chỉ cho workflow nhiều bước, cancellable hoặc state qua nhiều route; local form/drawer ở React Hook Form hoặc component state.

Next foundation work should be driven by real features: authenticated identity bootstrap, server pagination/filter URL contract, common form error mapper, and mutation audit/request-ID display. Redux/Saga đã có trong base nhưng chỉ kích hoạt theo tiêu chí workflow, không dùng để nhân đôi cache của generated TanStack Query.

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
- Orval consumes isolated Storefront domain YAML files; client output contains no Admin operation or schema.
- Existing service-worker security behavior remains intact; PWA remains client-only and commerce mutations remain online-only.
- Luồng ưu tiên kế thừa từ `dragon-web-v2`/`dragonx-employer-web` nhưng thích nghi cho Next.js: route server-first → feature composition → hook/client island nhỏ → generated public SDK → foundation/widget UI.
- Storefront không bê nguyên store-centric Vite flow: public catalog/content ưu tiên Server Component; Redux/Saga chỉ dành cho cart/checkout workflow phía browser và không chứa PII/payment.
- Catalog showcase, content stories và product reviews hiện đã có feature hook riêng; presentation component không còn import generated SDK hoặc Redux trực tiếp.

Next foundation work should focus on real routes: category/product detail server rendering, cart state without PII persistence, guest identity verification, checkout, account and order history. Do not convert public SEO routes to client-only query rendering by default.

## Contract boundary

The three applications do not share skills, React code or handwritten DTOs. The only cross-application runtime contract is:

```text
NestJS controller/DTO
  -> api/openapi/openapi.json + document/api/openapi-v1.yaml
  -> generated Admin/Storefront domain YAML
  -> isolated client/admin domain SDK
```

The root Yarn workspace only orchestrates these producer/consumer steps.

## Thứ tự ưu tiên khi rule tham khảo xung đột

1. Contract và security của dự án hiện tại (`document/api`, permission, PWA cache matrix).
2. `admin-client` cho list/form/RBAC/admin workflow.
3. `dragonx-employer-web` cho feature boundary, hook-centric UI, lazy loading và chất lượng.
4. `dragon-web-v2` cho storefront/PWA/data mapping; các rule Vite hoặc Redux toàn cục phải được chuyển sang Next.js server/client boundary trước khi áp dụng.

Mỗi app giữ bộ rule/skill riêng. Không copy cả thư mục rule giữa admin và client, không dùng React component/store chéo app; chỉ kế thừa pattern phù hợp và dùng OpenAPI YAML làm contract chung.
