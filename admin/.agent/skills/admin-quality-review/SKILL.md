---
name: admin-quality-review
description: Review DCTD admin changes for permissions, generated-contract use, list/form behavior, accessibility, tests, and production bundle risk before handoff.
---

# Admin quality review

Review only the admin application and report concrete failures.

- Confirm the route, menu item and feature actions use stable permission codes and that 403 remains handled.
- Confirm all internal requests and DTOs come from `src/generated/api`.
- Confirm TanStack Query, local state and Redux/Saga have not duplicated ownership of the same data.
- Exercise loading, empty, error, forbidden and success states.
- Check server pagination/sort/filter, stale-request cancellation and mutation invalidation.
- Check form mappings, immutable fields, validation errors and destructive confirmations.
- Run admin lint, tests and build; compare chunks with the current ~490 kB core reference and inspect lazy-loading boundaries.

Do not mark a feature complete only because the page renders with seed data.
