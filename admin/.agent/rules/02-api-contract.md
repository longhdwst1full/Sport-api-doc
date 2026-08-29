# Admin generated API contract

- `document/api/openapi-v1.yaml` is the versioned frontend HTTP contract, generated together with `api/openapi/openapi.json` from NestJS decorators.
- Generate admin hooks and DTOs with `yarn workspace @dctd/admin generate:api`.
- Orval uses exact `Admin *` tags to create an isolated SDK and models folder per business domain. Do not depend on stale generated files surviving regeneration.
- Import internal queries, mutations and DTOs only from `src/generated/api`.
- The mutator may set base URL, credentials, request ID, headers, AbortSignal and normalized transport errors. It must not define endpoint paths or business DTOs.
- Never retry create/update/delete/approve/reject automatically. GET retries must remain bounded.
- Invalidate with generated resource query keys after a successful mutation; do not invalidate every query without a concrete reason.
- Map generated DTOs to form/table view models at the feature boundary when display needs differ.
