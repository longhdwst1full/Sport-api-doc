# Admin generated API contract

- `api/openapi/openapi.json` is the only internal HTTP contract.
- Generate admin hooks and DTOs with `yarn workspace @dctd/admin generate:api`.
- Import queries, mutations and DTOs only from `src/generated/api`.
- The mutator may set base URL, credentials, request ID, headers, AbortSignal and normalized transport errors. It must not define endpoint paths or business DTOs.
- Never retry create/update/delete/approve/reject automatically. GET retries must remain bounded.
- Map generated DTOs to form/table view models at the feature boundary when display needs differ.
