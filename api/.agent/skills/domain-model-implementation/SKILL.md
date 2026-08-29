---
name: domain-model-implementation
description: Implement or review DCTD commerce aggregates, state transitions, repository boundaries, PostgreSQL persistence, transactions, inventory invariants, or idempotent commands under api.
---

# Domain model implementation

1. Read `document/09-v1-model.dbml`, `document/04-table-catalog.csv`, the relevant state-machine rules and owning module behavior.
2. Check `document/08-open-decisions.csv`: `DECIDED` items are constraints; `PROPOSED` items require explicit confirmation before they become irreversible schema behavior.
3. Write the invariant and allowed transition matrix before persistence code. Include actor/scope, concurrency and audit consequences.
4. Keep domain policy independent of NestJS HTTP DTOs and ORM entities where practical; replace demo arrays/Maps through owning repository ports.
5. Implement transactional adapters inside the owning bounded context. Decide idempotency scope/payload fingerprint and lock/optimistic-concurrency strategy for contested commands.
6. Add unit tests for every transition branch and PostgreSQL integration tests for constraints/transactions introduced.
7. Update DBML, table catalog and model registry together if the table model changes; regenerate the review workbook instead of editing it as schema truth.

Do not introduce the finance maker-checker lifecycle unless the specific commerce use case has been designated high risk.
