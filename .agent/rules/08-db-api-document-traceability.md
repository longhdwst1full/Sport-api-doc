# DB/API documentation traceability

- Any change to Prisma schema, SQL migration, database constraint/index/relation, persistence semantics, API route/DTO/response/error, permission or scope must update its documentation in the same work item.
- Database changes must reconcile `09-v1-model.dbml`, `04-table-catalog.csv`, relationship/decision docs and `DCTD-UTC-V1-database-model-review.xlsx`.
- API contract changes must be exported from NestJS to OpenAPI and regenerated into the affected FE SDK; generated artifacts are never edited manually.
- Add a durable entry to `11-model-change-log.json`. Run `yarn workspace @dctd/api docs:model:annotate`; changed workbook cells must be red and contain an Excel Note with the change reason and source reference.
- If the workbook marker reports an unresolved target, stop and correct the model/change-log mapping. Never hand off with a stale workbook.

