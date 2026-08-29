---
name: domain-model-implementation
description: Implement or review DCTD commerce aggregates, state transitions, repository boundaries, PostgreSQL persistence, transactions, inventory invariants, or idempotent commands under api.
---

# Domain model implementation

1. Read the reviewed DBML/table catalog and the owning module's current behavior.
2. Write the invariant and allowed transition matrix before persistence code. Include actor/scope, concurrency and audit consequences.
3. Keep domain policy independent of NestJS HTTP DTOs and ORM entities where practical.
4. Implement repository ports and transactional adapters inside the owning bounded context.
5. For commands, decide the idempotency scope and payload fingerprint. For stock/order/payment/return writes, decide the lock or optimistic concurrency strategy.
6. Add unit tests for every transition branch and PostgreSQL integration tests for constraints/transactions introduced.
7. Update DBML/catalog/model registry together if the table model changes.

Do not introduce the finance maker-checker lifecycle unless the specific commerce use case has been designated high risk.
