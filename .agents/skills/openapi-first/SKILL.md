---
name: openapi-first
description: Implement or change DCTD-UTC API and frontend integration using the repository's NestJS-to-OpenAPI-to-Orval workflow. Use for endpoints, DTOs, generated SDKs, React Query hooks, or API-consuming UI; do not use for UI that has no API dependency.
---

# OpenAPI-first workflow

Treat `api/openapi/openapi.json` as the only cross-app contract.

1. Change NestJS DTOs/controllers and add concrete Swagger metadata.
2. Run `yarn workspace @dctd/api openapi:generate`; inspect the affected paths and schemas.
3. Run `yarn workspace @dctd/client generate:api` and `yarn workspace @dctd/admin generate:api`.
4. Import generated hooks/types in features. Do not recreate them in app code.
5. Run type-check/build for all affected workspaces.

Keep custom mutators limited to transport concerns: base URL, credentials/token, request ID, response parsing and normalized transport errors. Never place endpoint paths or business response types in a mutator.

If generation fails, fix the backend OpenAPI or Orval config. Do not bypass generation with a handwritten client. Generated files must carry their generator header and remain mechanically replaceable.
