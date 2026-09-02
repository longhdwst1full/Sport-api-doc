# Storefront enums and constants

- API enum values and commerce codes come from generated Storefront DTOs when available. Do not duplicate generated contract enums in handwritten client code.
- Centralize storefront-owned route names, storage/cache keys, PWA cache prefixes, cart workflow states and analytics event codes in their owning feature or infrastructure module.
- Keep public catalog, customer auth, cart, checkout and PWA state values separate; never introduce a generic global status enum merely because literals overlap.
- Prefer `as const` objects with derived union types for values used at runtime and compile time. Use TypeScript `enum` only when framework/library interoperability benefits from it.
- UI labels are mapped separately from stable codes so changing Vietnamese copy does not change business comparisons or persisted values.
- Do not extract one-off text or URLs. API paths remain generated, and authenticated/cache-sensitive keys stay owned by the relevant transport or PWA module.

