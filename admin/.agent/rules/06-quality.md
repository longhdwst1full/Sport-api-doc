# Admin quality rules

- TypeScript must remain strict; avoid `any` and unjustified assertions.
- Test permission visibility, query/mutation states, form mapping and high-risk action confirmation.
- Lazy-load business routes and inspect bundle warnings before adding editors, charts, media or document libraries.
- Generated output is verified by regeneration, not edited to satisfy lint.
- Required checks are admin lint, test and production build.
