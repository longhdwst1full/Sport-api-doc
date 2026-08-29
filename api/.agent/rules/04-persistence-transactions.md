# Persistence and transaction rules

- Introduce repository ports at the owning module boundary and keep database implementations in infrastructure/persistence.
- PostgreSQL migrations follow the reviewed DBML/table delivery waves; migration order must respect foreign keys and unique constraints.
- Use numeric minor units or fixed precision for money; never JavaScript floating-point arithmetic for totals.
- Inventory truth comes from immutable movement/adjustment/receipt/return records plus derived balances. Reject any operation that would violate reserved/on-hand invariants.
- Lock or use optimistic concurrency on stock, order/payment transition and other contested writes.
- The V1 topology is one branch to one warehouse, but preserve identifiers in contracts/data so this can evolve without rewriting history.
- Media rows store provider key, URL and metadata; binary media is managed by the approved third-party provider, not PostgreSQL.
