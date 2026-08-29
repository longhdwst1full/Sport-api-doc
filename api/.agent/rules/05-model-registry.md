# V1 model coverage

- `src/modules/system/model-registry.data.ts` is a planning/coverage registry, not a persistence model or migration substitute.
- A registry entry must identify exactly one reviewed table and its P0/P1 delivery priority.
- When implementing a table, preserve the bounded-context owner documented in the registry/DBML.
- New tables require an update to the DBML, table catalog and registry coverage test in the same change.
- Do not create generic polymorphic tables merely to reduce table count when foreign-key integrity or ownership becomes unclear.
