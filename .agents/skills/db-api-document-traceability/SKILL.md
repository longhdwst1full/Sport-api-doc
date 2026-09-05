---
name: db-api-document-traceability
description: Keep DCTD database and API changes traceable across Prisma migrations, DBML/table documentation, OpenAPI/codegen artifacts, and the annotated database review workbook. Use whenever changing database structure, persistence semantics, API contracts, permissions, scopes, or error responses under api.
---

# DB/API document traceability

Use this skill together with the owning API implementation skill. Source code remains authoritative; documentation and generated contracts must describe the verified result.

Before editing files under `document/`, read and apply the workspace rule `.agent/rules/00-document-versioning.md`. Every changed human-authored document must increment its version and include a concrete current change summary plus revision-history entry. Machine-readable and generated artifacts use the exception/trace mechanism defined by that rule.

## Required workflow

1. Before editing, identify the affected tables, relationships, API operations, permissions, migrations and consumers. Run the repository's GitNexus impact analysis for existing symbols.
2. Implement and test the source change. Never repair an API contract by editing generated JSON, YAML or frontend SDK files.
3. For a database change, update every affected canonical model artifact:
   - `document/09-v1-model.dbml` for columns, keys and relationships.
   - `document/04-table-catalog.csv` for table purpose, important FKs, constraints, key columns and retention.
   - `document/10-v1-model-relationship-review.md` when cardinality, ownership or lifecycle changes.
   - `document/08-open-decisions.csv` when the implementation resolves or introduces a decision.
4. For an API behavior or contract change:
   - update the relevant plan/function/RBAC documentation;
   - export `api/openapi/openapi.json` and `document/api/openapi-v1.yaml` from NestJS;
   - regenerate only the affected admin/client SDKs under their local integration rules;
   - record permission, scope, error or compatibility implications.
5. Add one entry per logical change to `document/11-model-change-log.json`. Database entries target the exact workbook rows/cells. API-only entries may have an empty `targets` array but still appear in the workbook Change Log.
6. Run `yarn workspace @dctd/api docs:model:annotate`. It must:
   - highlight every targeted changed cell in red;
   - attach an Excel Note with change ID, date, reason and source references;
   - rebuild the workbook `Change Log` sheet;
   - fail if a requested sheet/header/row/cell cannot be resolved.
7. Open/validate `document/DCTD-UTC-V1-database-model-review.xlsx`, run relevant API/frontend gates, then run GitNexus change detection.
8. Verify all changed human-authored documents have a new version, current date, accurate summary and matching revision-history row before handoff.

## Trace rules

- A migration ID or API operation ID must be present in `sources`; prose such as “updated model” is insufficient.
- Mark only cells materially changed or whose interpretation changed. Do not color an entire workbook merely because a migration touched one table.
- Use one change ID consistently across the JSON entry, Excel Notes and review/handoff text.
- Never remove prior change-log entries. If a decision is superseded, add a new entry referencing the previous ID.
- Do not mark a DB/API function Done when canonical docs, OpenAPI/codegen, change log or workbook annotation is stale.
