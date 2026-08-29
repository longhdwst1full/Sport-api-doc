# API code intelligence and performance

- For unfamiliar behavior, search GitNexus execution flows by business concept, then inspect symbol context. Use `rg` for exact identifiers, filenames and literals.
- Run upstream impact analysis before changing an existing symbol and warn before HIGH or CRITICAL blast radius changes.
- Trace controller to application service, domain policy and repository port before editing; do not infer ownership from filenames alone.
- For persistence performance, verify query shape, indexes, pagination and transaction boundaries. Use PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` only against safe representative environments.
- Regenerate OpenAPI after contract changes and run GitNexus change detection before handoff or commit.
