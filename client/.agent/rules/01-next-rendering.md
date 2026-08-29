# Next.js rendering boundaries

- Default public, indexable catalog/content routes to server rendering where the data path supports it.
- Add `'use client'` only at the smallest boundary requiring state, effects, browser APIs or TanStack Query hooks.
- Generated React Query hooks require a client boundary; generated request functions may be used by server components when their caching/auth behavior is explicit.
- Do not pass non-serializable values across server/client boundaries.
- Use route metadata and semantic HTML for products, categories and editorial content.
- Keep authenticated customer, checkout and order state out of shared public caches.
- Never create request/customer-specific Redux state as a process-wide server singleton; initialize/hydrate browser-owned state through the client provider boundary.
- Route loading, not-found and error behavior must be intentional for product/content detail pages.
