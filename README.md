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

Project knowledge is organized in `.agent/rules`, `.agents/skills`, `_features`, `_plans`, `_prompts` and `_templates`. These are adapted from the useful patterns in the workspace references; financial-domain plans and generated indexes were intentionally not copied.

## Non-negotiable contract rule

Backend DTO/controller first, then OpenAPI export, then Orval generation. Frontends never hand-write API DTOs or endpoint URLs.
