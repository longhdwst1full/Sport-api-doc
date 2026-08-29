# Admin quality rules

- TypeScript must remain strict; avoid `any` and unjustified assertions.
- Test permission visibility, query/mutation states, form mapping and high-risk action confirmation.
- Lazy-load business routes and inspect bundle warnings before adding editors, charts, media or document libraries.
- Current production reference is approximately 490 kB for the largest admin core chunk; investigate meaningful regressions or any new chunk over 500 kB instead of silently raising the warning threshold.
- Generated output is verified by regeneration, not edited to satisfy lint.
- Required checks are admin lint, test and production build.
