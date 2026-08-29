---
name: code-quality
description: Verify DCTD changes before handoff or commit with Yarn linting, type checks, tests, contract generation, builds, and generated-file drift review.
---

# DCTD quality workflow

Run from the workspace root:

1. `yarn lint` for API ESLint, client type checking, and admin ESLint.
2. `yarn test` for Jest and Vitest suites.
3. `yarn contracts:generate`; never fix generated output by hand.
4. `yarn build` for all production builds.
5. When the repository has a baseline commit, run `yarn contracts:check` to detect stale generated contracts.

Zero TypeScript and ESLint errors are allowed. A suppression needs a local reason. New business branches need tests; HTTP contract changes need generation verification. Review admin bundle warnings and lazy-load feature routes before adding heavy editors, charts, PDF viewers, or media libraries.

Next.js route files may use required default exports. Other reusable modules prefer named exports for safer refactoring.
