# Next.js rendering boundaries

- Default public, indexable catalog/content routes to server rendering where the data path supports it.
- Add `'use client'` only at the smallest boundary requiring state, effects, browser APIs or TanStack Query hooks.
- Do not pass non-serializable values across server/client boundaries.
- Use route metadata and semantic HTML for products, categories and editorial content.
- Keep authenticated customer, checkout and order state out of shared public caches.
- Route loading, not-found and error behavior must be intentional for product/content detail pages.
