# DCTD-UTC Commerce

Base workspace for a sports equipment storefront, admin portal and API.

## Applications

- `api`: NestJS modular API, Swagger UI and generated OpenAPI contract.
- `client`: Next.js storefront/PWA using Tailwind and generated React Query SDK.
- `admin`: React/Vite admin using Ant Design, Tailwind and the same generated SDK.

## Commands

```bash
yarn install
cp api/.env.example api/.env
cp client/.env.example client/.env.local
cp admin/.env.example admin/.env
yarn contracts:generate
yarn dev
```

Khởi tạo PostgreSQL/Redis local và chạy migration/seed lặp lại an toàn:

```bash
yarn db:local:up
yarn db:local:migrate
yarn db:local:seed
yarn db:local:seed:demo
```

`db:local:seed:demo` chạy foundation seed trước, sau đó upsert bộ dữ liệu nhỏ gồm
3 chi nhánh/kho, 3 thương hiệu, 3 danh mục và 3 sản phẩm/SKU/giá. Lệnh có thể chạy
lặp và không xóa dữ liệu ngoài các mã demo cố định.

Local infrastructure mặc định dùng PostgreSQL `55432` và Redis `56379` để không
xung đột với các service khác trong workspace. Có thể override bằng
`DCTD_POSTGRES_PORT` và `DCTD_REDIS_PORT`.

OpenAPI is served at `http://localhost:4000/openapi.json`; Swagger UI is at `http://localhost:4000/docs`.

The storefront exposes its PWA diagnostics/reset screen at `http://localhost:3000/pwa`. API, checkout, account and payment data are never service-worker cached.

The API registers the reviewed V1 model across bounded contexts. Organization, IAM, Audit, Catalog and basic Inventory adjustment/balance/ledger use Prisma/PostgreSQL when `DATABASE_ENABLED=true`. CMS Content and Review moderation remain in-memory vertical slices until their delivery sprint.

Authentication transport is environment-specific: use `AUTH_TOKEN_TRANSPORT=BODY` with the matching frontend flags in local development; production validation requires `COOKIE`, `AUTH_BYPASS=false`, and explicit `CORS_ORIGINS`. COOKIE mode keeps refresh tokens in scoped HttpOnly cookies and access tokens in frontend memory.

Each application owns an independent agent context:

- `admin/AGENTS.md`, `admin/.agent/rules`, `admin/.agent/skills`: React/Vite, Ant Design, admin permissions, list/form and generated admin SDK workflows.
- `client/AGENTS.md`, `client/.agent/rules`, `client/.agent/skills`: Next.js rendering, storefront commerce UX, PWA security/offline behavior and generated public SDK workflows.
- `api/AGENTS.md`, `api/.agent/rules`, `api/.agent/skills`: NestJS modules, OpenAPI producer contract, authorization/audit, transitions, persistence and API verification.

The root `AGENTS.md` only routes monorepo and contract orchestration; it is not a shared application rule set. Root `_features`, `_plans`, `_prompts` and `_templates` remain project planning assets, not executable application skills. The local rule sets are adapted from the useful patterns in the workspace references; finance-specific plans and framework-incompatible Java/Quarkus implementation details were intentionally not copied.

The source-by-source frontend architecture review and inheritance decisions are documented in `document/12-frontend-base-source-review.md`.

## Non-negotiable contract rule

Backend DTO/controller first, then OpenAPI export, then Orval generation. Frontends never hand-write API DTOs or endpoint URLs.
