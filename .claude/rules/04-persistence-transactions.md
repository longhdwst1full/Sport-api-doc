# Persistence and transaction rules

- Introduce repository ports at the owning module boundary and keep Prisma implementations under that module's `repositories/`; `src/database` owns only Prisma lifecycle/configuration.
- Prisma 6.19 is the selected V1 client/migration foundation (D33). Its base module exists, but no business model/migration is implemented until the relevant DBML wave and D19/D20/D22/D23 decisions are reviewed.
- `DATABASE_ENABLED=false` keeps tooling/OpenAPI disconnected from PostgreSQL. A deployed persisted service must enable it and supply both pooled runtime `DATABASE_URL` and direct/session `DIRECT_URL` for migrations; never run migrations through the transaction pooler.
- PostgreSQL migrations follow the reviewed DBML/table delivery waves; migration order must respect foreign keys and unique constraints.
- Use numeric minor units or fixed precision for money; never JavaScript floating-point arithmetic for totals.
- Inventory truth comes from immutable movement/adjustment/receipt/return records plus derived balances. Reject any operation that would violate reserved/on-hand invariants.
- Lock or use optimistic concurrency on stock, order/payment transition and other contested writes.
- The V1 topology is one branch to one warehouse, but preserve identifiers in contracts/data so this can evolve without rewriting history.
- Media rows store provider key, URL and metadata; binary media is managed by the approved third-party provider, not PostgreSQL.
- Current arrays/Maps are demo adapters, not evidence that locking, transactions, constraints, audit retention or multi-instance correctness exists.
