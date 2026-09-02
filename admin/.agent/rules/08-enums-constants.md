# Admin enums and constants

- API enum values and business codes come from generated DTOs whenever the OpenAPI contract exposes them. Do not create a second handwritten enum that can drift from `src/generated/api`.
- Centralize admin-owned values such as route IDs, navigation keys, storage keys, query-key extensions and UI workflow states in the owning `app`, `core` or feature module.
- Keep feature state families separate. Do not create a global `CommonStatus` for unrelated user, product, payment and review workflows.
- Prefer `as const` objects with derived union types for local values used at runtime and compile time. Use TypeScript `enum` only when library interoperability requires it.
- Reuse constants in form options, permission gates, table filters and transition labels; keep Vietnamese display labels in a deliberate label map rather than embedding them in business comparisons.
- Do not extract one-off copy, CSS classes or endpoint strings. Endpoint paths and contract DTOs always remain generated.

