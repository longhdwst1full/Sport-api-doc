# API code intelligence and performance

- Start unfamiliar work with `yarn gitnexus status`, then query business flows in repo `dctd-utc` and inspect symbol context. Use `rg` for exact identifiers, filenames and literals.
- Run upstream impact analysis before changing an existing symbol and warn before HIGH or CRITICAL blast radius changes.
- Trace controller to application service, domain policy and repository port before editing; do not infer ownership from filenames alone.
- For persistence performance, verify query shape, indexes, pagination and transaction boundaries. Use PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` only against safe representative environments.
- Regenerate OpenAPI after contract changes and run GitNexus change detection before handoff or commit.
- Change detection has previously altered staging in this workspace; compare `git status` before/after and never unstage pre-existing user work.
