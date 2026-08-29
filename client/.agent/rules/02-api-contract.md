# Storefront generated API contract

- `api/openapi/openapi.json` is the only internal HTTP contract.
- Generate storefront hooks and DTOs with `yarn workspace @dctd/client generate:api`.
- Orval includes only tags matching `Storefront *`, uses `tags-split` and cleans output. Unexpected admin operation output is a contract/configuration failure.
- Public client features may import only storefront/public operations from `src/generated/api`; protected admin operation modules are forbidden even if Orval generated them.
- The fetcher owns base URL, safe credentials/headers, AbortSignal and normalized transport errors. It owns no endpoint path or business DTO.
- GET retry is bounded. Cart/order/payment mutations are never retried automatically.
- Keep public server-side fetch behavior and browser query behavior explicit; do not accidentally force all catalog rendering into the client.
- Do not forward a browser credential model into shared server rendering by accident; personalized requests require an explicit per-request auth/caching design.
