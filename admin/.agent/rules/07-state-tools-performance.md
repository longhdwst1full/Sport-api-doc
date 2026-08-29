# Admin state, tooling and performance

- TanStack Query owns remote/server state. Redux owns cross-route UI or workflow state; do not mirror generated query data into Redux.
- Use Saga for cancellable or multi-step workflows and persistence. Keep one-step component interactions in reducers/hooks.
- Axios is the generated SDK transport. Endpoint paths and DTOs remain OpenAPI-generated.
- Use React Hook Form with Yup for multi-field business forms; map form values to generated DTOs at the feature boundary.
- Debounce server-backed text filters and let AbortSignal cancel stale generated queries.
- Keep CKEditor and other heavy editors dynamically imported. A valid commercial or GPL-compatible license decision is required; never invent a key.
- Use Recharts only for decision-supporting data. Use react-window for lists large enough to benefit from virtualization and provide stable row keys/heights.
- Check the production bundle after adding a large dependency; avoid root-level imports that pull feature libraries into the initial chunk.
