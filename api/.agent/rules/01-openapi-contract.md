# OpenAPI contract ownership

- Every endpoint has a stable explicit operation ID, tag, success response DTO and documented relevant error responses.
- Decorated DTO properties have explicit TypeScript/Swagger types, nullability, enums, examples where useful and class-validator rules.
- List responses expose explicit data and pagination metadata; never return an undocumented raw object.
- Persistence entities are mapped to contract DTOs.
- Export with `yarn workspace @dctd/api openapi:generate` and inspect `openapi/openapi.json`.
- A breaking schema, meaning, required-field or operation change requires an explicit version/migration decision.
- The API export is producer output. Frontend SDK generation belongs to each frontend's local workflow.
