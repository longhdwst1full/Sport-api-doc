# Backend bounded contexts

The reviewed V1 model contains 74 tables (43 P0, 31 P1). `system/model-registry.data.ts` is the executable coverage manifest and its unit test prevents a table from silently disappearing during refactoring.

Status meanings:

- `ACTIVE`: the module has at least one real HTTP/application vertical slice in this base.
- `SCAFFOLDED`: the Nest boundary exists and its models are registered, but no generic CRUD API is exposed yet.

Active base slices are Catalog, Inventory, CMS Content and Product Reviews. Remaining modules are intentionally opened by use case and delivery wave from `document/07-delivery-plan.md`; an empty generic CRUD controller would bypass state-machine, audit, idempotency and transaction rules.

Persistence is still represented by the reviewed DBML in `document/09-v1-model.dbml`. Before replacing the in-memory adapters, generate and review PostgreSQL migrations wave-by-wave rather than creating all P0/P1 tables in one migration.
