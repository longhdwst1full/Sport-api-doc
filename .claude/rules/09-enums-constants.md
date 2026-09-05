# API enums and constants

- Centralize repeated business codes, lifecycle values, audit actions and security defaults in the owning bounded context. Prefer `as const` objects plus derived union types when values cross Prisma/string boundaries; use TypeScript `enum` only when enum semantics improve interoperability.
- Keep each state family separate. User, role, product, payment and fulfillment statuses must not be collapsed into a generic `ACTIVE/INACTIVE` enum merely because some values match.
- DTO validation and Swagger metadata reuse the owning enum/constant values. Do not repeat literal arrays independently in service, DTO and repository code.
- Repository queries, state guards, seed code and audit snapshots reuse the same bounded-context values where they represent the same business concept.
- Do not extract a one-off string just to remove a literal. Constants are warranted when a value is reused, externally stable, security-sensitive or represents a business rule.
- SQL migrations are immutable historical artifacts. Do not rewrite old migrations to import or mimic application constants; database CHECK constraints remain explicit SQL and new migrations must stay consistent with canonical domain values.
- Generated OpenAPI and frontend SDK files are never edited to introduce constants. Export the contract from source decorators/DTOs.

