# OpenAPI contract ownership

- Every endpoint has a stable explicit operation ID, tag, success response DTO and documented relevant error responses.
- Decorated DTO properties have explicit TypeScript/Swagger types, nullability, enums, examples where useful and class-validator rules.
- List responses expose explicit data and pagination metadata; never return an undocumented raw object.
- Persistence entities are mapped to contract DTOs.
- Export with `yarn workspace @dctd/api openapi:generate`. Inspect `openapi/openapi.json` as the producer artifact and `../document/api/openapi-v1.yaml` as the versioned frontend consumer contract; both come from the same NestJS document.
- The package script is the canonical export path; do not invoke or repair generated JSON through an ad-hoc script path.
- A breaking schema, meaning, required-field or operation change requires an explicit version/migration decision.
- The API export is producer output. Frontend SDK generation belongs to each frontend's local workflow.
