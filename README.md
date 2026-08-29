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

OpenAPI is served at `http://localhost:4000/openapi.json`; Swagger UI is at `http://localhost:4000/docs`.

The storefront exposes its PWA diagnostics/reset screen at `http://localhost:3000/pwa`. API, checkout, account and payment data are never service-worker cached.

The API registers all 74 reviewed V1 models across 19 bounded contexts. Catalog, basic Inventory, CMS Content and Review moderation are runnable in-memory vertical slices; persistence migrations remain deliberately separate and must follow the DBML delivery waves before production use.

Each application owns an independent agent context:

- `admin/AGENTS.md`, `admin/.agent/rules`, `admin/.agent/skills`: React/Vite, Ant Design, admin permissions, list/form and generated admin SDK workflows.
- `client/AGENTS.md`, `client/.agent/rules`, `client/.agent/skills`: Next.js rendering, storefront commerce UX, PWA security/offline behavior and generated public SDK workflows.
- `api/AGENTS.md`, `api/.agent/rules`, `api/.agent/skills`: NestJS modules, OpenAPI producer contract, authorization/audit, transitions, persistence and API verification.

The root `AGENTS.md` only routes monorepo and contract orchestration; it is not a shared application rule set. Root `_features`, `_plans`, `_prompts` and `_templates` remain project planning assets, not executable application skills. The local rule sets are adapted from the useful patterns in the workspace references; finance-specific plans and framework-incompatible Java/Quarkus implementation details were intentionally not copied.

## Non-negotiable contract rule

Backend DTO/controller first, then OpenAPI export, then Orval generation. Frontends never hand-write API DTOs or endpoint URLs.
