---
name: admin-api-integration
description: Integrate DCTD admin screens with the NestJS OpenAPI contract through Orval-generated TanStack Query hooks and DTOs. Use only for admin API consumption or SDK regeneration.
---

# Admin API integration

The backend contract must already exist in `api/openapi/openapi.json`.

1. From the repository root, run `yarn workspace @dctd/admin generate:api`.
2. Inspect only changed `Admin *` operation modules/models for names, nullability, pagination, permissions and error responses.
3. Use generated hooks/functions directly in the feature. Put UI-only mapping beside that feature.
4. Keep the custom fetcher limited to transport behavior; never add a handwritten internal URL or duplicate DTO.
5. Preserve generated AbortSignal support. Invalidate the narrow generated resource key after successful mutations; mutations remain non-retrying.
6. Review the generated diff for unexpected tag leakage/deletions, then run admin lint, tests and build.

If the generated contract is wrong, stop and fix/export the API contract under the API application's own instructions, then regenerate.
