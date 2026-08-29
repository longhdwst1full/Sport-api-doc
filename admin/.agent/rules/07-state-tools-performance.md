# Admin state, tooling and performance

- TanStack Query owns remote/server state. Redux owns cross-route UI or workflow state; do not mirror generated query data into Redux.
- Prefer component state for local drawers/inputs. Use Redux only when state crosses routes/features or needs centralized workflow semantics.
- Use Saga for cancellable, multi-step or persistence workflows; do not route every async operation through Saga when a generated mutation already owns it.
- Persist only a versioned, validated allowlist of non-sensitive fields. Hydration must tolerate corrupt/older storage without breaking application boot.
- Axios is the generated SDK transport. Endpoint paths and DTOs remain OpenAPI-generated.
- Use React Hook Form with Yup for multi-field business forms; map form values to generated DTOs at the feature boundary.
- Debounce server-backed text filters and let AbortSignal cancel stale generated queries.
- Keep CKEditor and other heavy editors dynamically imported. A valid commercial or GPL-compatible license decision is required; never invent a key.
- Use Recharts only for decision-supporting data. Use react-window for lists large enough to benefit from virtualization and provide stable row keys/heights.
- Check the production bundle after adding a large dependency; avoid root-level imports that pull feature libraries into the initial chunk.
