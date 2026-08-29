# Storefront state, tooling and performance

- TanStack Query owns remote catalog/content state. Redux owns interactive commerce state such as a local cart or checkout workflow; never duplicate generated response caches.
- Use Saga only for multi-step, cancellable or persistence workflows. Persist the minimum cart fields and never store customer PII, payment data or server-authoritative stock/price decisions.
- Axios is the OpenAPI SDK transport. Preserve AbortSignal, credentials policy and normalized errors.
- Keep public reading surfaces as server components by default. Redux consumers must be narrow client components.
- Do not add admin-only editors, charting or large-list libraries to the storefront without a measured user-facing requirement.
- Review client JavaScript and PWA cache behavior after adding dependencies; checkout/payment responses are network-only and mutations are not auto-retried.
