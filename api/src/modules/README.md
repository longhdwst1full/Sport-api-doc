# Backend bounded contexts

The reviewed V1 model contains 74 tables (43 P0, 31 P1). `system/model-registry.data.ts` is the executable coverage manifest and its unit test prevents a table from silently disappearing during refactoring.

Status meanings:

- `ACTIVE`: the module has at least one real HTTP/application vertical slice in this base.
- `SCAFFOLDED`: the Nest boundary exists and its models are registered, but no generic CRUD API is exposed yet.

Active base slices are Organization, IAM, Catalog, Inventory, CMS Content and Product Reviews. Organization and IAM implement the Sprint 1 HTTP/application flow with an in-memory adapter; this activates the contract and domain validation only, not PostgreSQL persistence, durable audit or production authentication. Remaining modules are intentionally opened by use case and delivery wave from `document/07-delivery-plan.md`; an empty generic CRUD controller would bypass state-machine, audit, idempotency and transaction rules.

Use two reference shapes for new V1 work:

- Organization/IAM: compact feature module when controller, service, DTO and repository remain cohesive.
- Catalog/Products: nested module with `controllers/dto/services` when a parent domain contains multiple capabilities or file groups.

Add `repositories` and `enums` only when real files exist. Prisma repositories remain inside the owning module; `src/database` only owns Prisma lifecycle. Payment/shipping/media now have provider/integration boundaries but are not active order/payment/shipment endpoints or production integrations.

Persistence is still represented by the reviewed DBML in `document/09-v1-model.dbml`. Before replacing the in-memory adapters, generate and review PostgreSQL migrations wave-by-wave rather than creating all P0/P1 tables in one migration.
