---
name: api-quality-review
description: Review DCTD API changes for module ownership, authorization, OpenAPI accuracy, transitions, idempotency, persistence safety, tests, and generated-contract readiness.
---

# API quality review

- Confirm controller/service/domain/persistence responsibilities and cross-module dependencies.
- Classify every reviewed slice as active in-memory, scaffolded, or persisted; do not collapse these states into "implemented".
- Confirm permissions and branch/warehouse scope are enforced by the API.
- Confirm transition commands cannot jump state and retries are safe where required.
- Confirm DTO validation, Swagger metadata, operation IDs, success/error schemas and persistence mapping.
- Confirm money, inventory, audit, PII logging and concurrency behavior.
- Distinguish unit coverage from real PostgreSQL integration coverage.
- Run API lint, tests, OpenAPI generation and build; inspect the contract diff and report missing HTTP/PostgreSQL/concurrency coverage explicitly.

Report in-memory-only behavior explicitly and do not describe registry entries as implemented database tables.
