---
name: api-contract-generation
description: Design, export, inspect, and verify the DCTD NestJS OpenAPI producer contract. Use only for API DTO/controller contract changes or openapi.json generation.
---

# API contract generation

1. Verify each affected controller operation has a stable explicit operation ID, tag, auth/permission behavior and concrete response types.
2. Verify DTO decorators and validators agree on required fields, enums, arrays, nested objects and nullability.
3. Run `yarn workspace @dctd/api openapi:generate` from the repository root.
4. Inspect affected paths/components in `api/openapi/openapi.json`, including error responses and query serialization.
5. Run API tests and build. Treat consumer SDK regeneration as a separate client/admin workflow.

Never repair a bad exported schema by manually editing `openapi.json`; fix the DTO/controller source and regenerate.
