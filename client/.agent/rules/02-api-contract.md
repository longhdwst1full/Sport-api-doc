# Storefront generated API contract

- `api/openapi/openapi.json` is the only internal HTTP contract.
- Generate storefront hooks and DTOs with `yarn workspace @dctd/client generate:api`.
- Public client features may import only storefront/public operations from `src/generated/api`; protected admin operation modules are forbidden even if Orval generated them.
- The fetcher owns base URL, safe credentials/headers, AbortSignal and normalized transport errors. It owns no endpoint path or business DTO.
- GET retry is bounded. Cart/order/payment mutations are never retried automatically.
- Keep public server-side fetch behavior and browser query behavior explicit; do not accidentally force all catalog rendering into the client.
