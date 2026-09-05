# Sport API and system documents

> **Document version:** 3.0.0
>
> **Last updated:** 2026-09-05
>
> **Change summary:** Chuyển Git/dependency root vào API và cập nhật toàn bộ lệnh/path chạy độc lập.

NestJS API, Prisma/PostgreSQL migrations, generated OpenAPI contracts and system design
documents for the sports-commerce platform.

## Repository boundaries

- This repository: NestJS source, `document/`, generated OpenAPI, API CI and API engineering rules.
- Admin: `https://github.com/longhdwst1full/Sport-Admin.git`.
- Storefront/PWA: `https://github.com/longhdwst1full/Sport-Client.git`.
- Admin and Client may be placed in sibling folders, but they are not children of this Git repository.

The API is the OpenAPI producer. Every contract change starts in NestJS DTO/controller code,
then generates `openapi/openapi.json` and `document/api/openapi-v1.yaml` plus the Admin and
Storefront domain slices. Frontend repositories sync those generated YAML slices before Orval
code generation; they never hand-write endpoint URLs or generated DTOs.

## Setup

```bash
yarn install --frozen-lockfile
cp .env.local.example .env.local
yarn db:status
yarn db:migrate
yarn db:seed
yarn db:seed:demo
yarn dev
```

Development uses the configured Supabase PostgreSQL database. Do not start a local database
Docker stack. `DATABASE_URL` is for runtime pooling and `DIRECT_URL` is for migrations.

Bootstrap development OWNER:

```text
bootstrap-admin@example.invalid
Aa@123456
```

The first login requires a password change. If the bootstrap account is locked after five
failed attempts, run `yarn db:admin:reset`; this command is forbidden in production.

## Contract and quality gates

```bash
yarn contracts:generate
yarn contracts:check
yarn lint
yarn test
yarn build
yarn verify
```

Swagger UI is served at `http://localhost:4000/docs`; the raw contract is available at
`http://localhost:4000/openapi.json`.

## Structure

```text
src/          NestJS modules, common infrastructure and integrations
prisma/       Prisma schema, migrations and seeds
openapi/      Producer OpenAPI JSON
document/     Model, RBAC, sprint evidence, generated YAML slices and review workbook
.github/      API CI gate
```

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 3.0.0 | 2026-09-05 | Chuyển Git và dependency root vào `api/`; cập nhật lệnh/path standalone. | API Git-root migration |
| 1.0.0–1.5.0 | 2026-09-04–2026-09-05 | Monorepo foundation through Sprint 1 Storybook and UI stabilization. | Existing repository history |
| 2.0.0 | 2026-09-05 | Split Admin/Storefront into independent repositories and retain API/document ownership here. | Repository split 2026-09-05 |
