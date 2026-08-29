---
name: admin-api-integration
description: Integrate DCTD admin screens with the NestJS OpenAPI contract through Orval-generated TanStack Query hooks and DTOs. Use only for admin API consumption or SDK regeneration.
---

# Admin API integration

The backend contract must already exist in `api/openapi/openapi.json`.

1. From the repository root, run `yarn workspace @dctd/admin generate:api`.
2. Inspect changed admin operations and models for names, nullability, pagination and error responses.
3. Use generated hooks/functions directly in the feature. Put UI-only mapping beside that feature.
4. Keep the custom fetcher limited to transport behavior; never add a handwritten internal URL or duplicate DTO.
5. Configure query keys/invalidation according to the affected admin resource and make mutations non-retrying by default.
6. Run admin lint, tests and build.

If the generated contract is wrong, stop and fix/export the API contract under the API application's own instructions, then regenerate.
