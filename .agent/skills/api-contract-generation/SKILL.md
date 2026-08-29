---
name: api-contract-generation
description: Design, export, inspect, and verify the DCTD NestJS OpenAPI producer contract. Use only for API DTO/controller contract changes or openapi.json generation.
---

# API contract generation

1. Verify each affected active controller operation has a stable explicit operation ID, `Admin *` or `Storefront *` tag, auth/permission behavior and concrete response types.
2. Verify DTO decorators and validators agree on required fields, enums, arrays, nested objects and nullability.
3. Run `yarn workspace @dctd/api openapi:generate` from the repository root. It exports both `api/openapi/openapi.json` and `document/api/openapi-v1.yaml` from one NestJS document.
4. Inspect only affected paths/components in the JSON producer artifact and YAML consumer contract, including error responses and query serialization; confirm exact tags will route to the intended domain SDK.
5. Run API tests/build. For an approved cross-app contract delivery, use root `yarn contracts:generate`; otherwise treat each consumer regeneration as a separate workflow.

Never repair a bad exported schema by manually editing JSON or YAML; fix the DTO/controller source and regenerate.
