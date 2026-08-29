# Admin list and form patterns

For list pages:

- Keep filter state serializable and synchronize useful filters/page/sort with the URL.
- Debounce text search, cancel stale requests and reset page when filters change.
- Keep server pagination and sorting authoritative; do not sort a single page as if it were the full dataset.
- Define row identity explicitly and clear invalid selections after mutation/refetch.

For create/update/detail:

- Reuse field components where practical, but keep read-only detail semantics clear.
- Map DTO to form and form to request in pure feature functions.
- Immutable identifiers are disabled on edit and excluded from update payloads.
- Map server validation details to fields; show non-field errors at form level.
- Close a modal only after the matching mutation succeeds.
