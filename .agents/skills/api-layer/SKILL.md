---
name: api-layer
description: Add or change DCTD internal API endpoints, Swagger DTOs, Orval SDKs, generated React Query hooks, transport mutators, or API-consuming UI across api, client, and admin.
---

# DCTD API layer workflow

Internal APIs have one lane only: NestJS controller/DTO to OpenAPI to generated SDK. Do not create a manual fallback when generation fails.

1. Add the use case in `api/src/modules/<domain>` with a thin controller, validated request DTO, concrete response DTO, stable operationId, Swagger tag, and permission code for protected operations.
2. Keep persistence entities private. Map them to response DTOs and use explicit types on decorated properties so OpenAPI never emits `Object` accidentally.
3. Run `yarn workspace @dctd/api openapi:generate` and inspect affected paths, security metadata, parameters, status responses, and schemas in `api/openapi/openapi.json`.
4. Run `yarn workspace @dctd/client generate:api` and `yarn workspace @dctd/admin generate:api`.
5. Import hooks and DTOs from each app's `src/generated/api`. Never edit generated files or duplicate an API DTO in feature code.
6. Keep mutators transport-only: base URL, credentials/token, headers, AbortSignal, query serialization, body serialization, error normalization. Business defaults and DTO mapping belong in feature/application code.
7. Use a wrapper only when it composes multiple generated calls or maps generated DTOs to a UI model. A wrapper must not hand-write an internal endpoint path.
8. Run affected tests, `yarn lint`, and `yarn build`.

Third-party APIs without OpenAPI are isolated under an explicit adapter module; their manual types must never masquerade as generated internal contracts.
