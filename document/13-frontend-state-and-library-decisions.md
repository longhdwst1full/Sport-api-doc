# Frontend state and library decisions

## Ownership

| Concern                         | Owner                 | Rule                                                                         |
| ------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| HTTP transport                  | Axios mutator         | Base URL, credentials, AbortSignal and normalized errors only                |
| Remote/server state             | TanStack Query        | Generated OpenAPI queries/mutations remain authoritative                     |
| Cross-feature UI/workflow state | Redux Toolkit         | Serializable client-owned state only                                         |
| Async orchestration/persistence | Redux Saga            | Multi-step, cancellable or persistence workflows; no API cache duplication   |
| Complex admin forms             | React Hook Form + Yup | Validate form values and map to generated DTOs at feature boundary           |
| Admin search                    | use-debounce          | Debounce server filters; generated query cancellation handles stale requests |
| Admin reporting                 | Recharts              | Route-scoped decision-supporting charts                                      |
| Large admin lists               | react-window          | Stable row key and predictable row height                                    |
| Rich content                    | CKEditor 5            | Dynamic import and explicit license configuration                            |

## Applied V1 examples

- Admin layout collapse state is in Redux; Saga persists the preference.
- Storefront cart is in Redux; Saga persists only product ID, name, price and quantity. No PII or payment data is stored.
- Product creation uses React Hook Form/Yup and the generated `useCreateAdminProduct` mutation.
- Product search uses a 350 ms debounce.
- Dashboard uses Recharts and a virtualized module list.
- CMS editor is lazy-loaded and remains disabled until `VITE_CKEDITOR_LICENSE_KEY` is configured.

## Performance guardrails

- Never mirror TanStack Query responses into Redux.
- Keep heavy feature libraries out of provider/root imports.
- Validate production bundles after dependency changes.
- Storefront remains server-rendered by default; introduce client boundaries only for interaction.
- API mutations are not auto-retried; payment/checkout data is never treated as offline-persistable state.
