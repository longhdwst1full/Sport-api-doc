---
name: admin-feature-development
description: Build or change a DCTD admin feature, including routes, permission-aware navigation, Ant Design lists/forms, mutations, and feature tests. Use only for work under admin.
---

# Admin feature development

Read the relevant admin rules first, especially directory structure, routing, UI ownership and permissions.

1. Locate the current route/flow with the navigation skill when unfamiliar, then identify the generated DTO/query/mutation and reviewed view/action permission codes.
2. Create or extend `src/features/<feature>`; keep routing and navigation declarations in their application-level configuration files.
3. Implement loading, empty, error and forbidden behavior before considering the happy path complete.
4. For lists, use server pagination/sort/filter, debounce text input and preserve AbortSignal cancellation. For forms, use React Hook Form/Yup as the state/validation owner, isolate DTO mapping and render server errors.
5. Represent business transitions as named actions with confirmation, not direct status field edits.
6. Keep editors/charts/large-list code route-scoped or dynamically imported. Add tests for mapping, permissions and mutation outcomes; run the local quality gate.

Do not use storefront components or backend services as reusable admin code. Cross-application reuse stops at the generated HTTP contract.
