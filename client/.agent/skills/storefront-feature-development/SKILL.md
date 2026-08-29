---
name: storefront-feature-development
description: Build or change a DCTD customer storefront feature with Next.js App Router, commerce UX, responsive Tailwind UI, generated contracts, and appropriate server/client rendering. Use only under client.
---

# Storefront feature development

Read the relevant client rules before implementation.

1. Locate the current journey with the navigation skill when unfamiliar, then define SEO/indexing, authentication and offline contract A/B/C.
2. Choose server rendering by default for public read content; isolate interactive client components narrowly.
3. Compose pages through the current `layouts`/`widgets`/`features` boundaries. Use only public generated operations and map DTOs inside the owning feature.
4. Implement loading, empty, not-found, error and offline behavior, including stale price/stock handling.
5. Make variant/combo selection and purchase constraints explicit before add-to-cart; persisted cart prices remain display snapshots until online checkout validation.
6. Verify responsive layout, accessibility, images/CLS, tests and production build.

Do not reuse admin feature code. Shared truth between applications is the OpenAPI contract, not React components or stores.
