# Backend bounded contexts

> **Document version:** 1.2.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Kích hoạt Order, Payment và Fulfillment thành các vertical slice Sprint 4.

The reviewed V1 model contains 74 tables (43 P0, 31 P1). `system/model-registry.data.ts` is the executable coverage manifest and its unit test prevents a table from silently disappearing during refactoring.

Status meanings:

- `ACTIVE`: the module has at least one real HTTP/application vertical slice in this base.
- `SCAFFOLDED`: the Nest boundary exists and its models are registered, but no generic CRUD API is exposed yet.

Active slices are Organization, IAM, Catalog, Inventory, Cart, Checkout, Shipping quote, Order, Payment, Fulfillment, CMS Content and Product Reviews. Checkout sở hữu quote/reservation; Order sở hữu snapshot; Payment sở hữu trạng thái thu tiền/ledger/evidence; Fulfillment sở hữu pick-pack-ship/delivery và stock commit. Remaining modules are intentionally opened by use case and delivery wave from `document/07-delivery-plan.md`; an empty generic CRUD controller would bypass state-machine, audit, idempotency and transaction rules.

Use two reference shapes for new V1 work:

- Organization/IAM: compact feature module when controller, service, DTO and repository remain cohesive.
- Catalog/Products: nested module with `controllers/dto/services` when a parent domain contains multiple capabilities or file groups.

Add `repositories` and `enums` only when real files exist. Prisma repositories remain inside the owning module; `src/database` only owns Prisma lifecycle. Payment/shipping/media now have provider/integration boundaries but are not active order/payment/shipment endpoints or production integrations.

Persistence is still represented by the reviewed DBML in `document/09-v1-model.dbml`. Before replacing the in-memory adapters, generate and review PostgreSQL migrations wave-by-wave rather than creating all P0/P1 tables in one migration.

## Maintenance notes

- Module có transaction, concurrency, provider hoặc state machine phải có `README.md` ngay trong module; Checkout là mẫu tại `checkout/README.md`.
- README ghi trách nhiệm, entrypoint, bảng đọc/ghi, invariant, cấu hình, test và checklist khi sửa. Không sao chép toàn bộ source vào tài liệu.
- Chỉ comment trong code khi giải thích **tại sao**, invariant, lock order, idempotency hoặc giới hạn tích hợp. Không comment lại cú pháp hiển nhiên.
- Nếu đổi route/DTO/error/permission/persistence, cập nhật OpenAPI, tài liệu trace và workbook theo rule của API.
- `src/generated`, Prisma Client và OpenAPI artifacts là generated output; sửa producer rồi regenerate, không thêm comment bằng tay vào output.

## Revision history

| Version | Date | Change summary | Source |
| --- | --- | --- | --- |
| 1.2.0 | 2026-09-13 | Kích hoạt Order, Payment, Fulfillment và maintenance workers Sprint 4. | DBAPI-20260913-FULFILLMENT-S43 |
| 1.0.0 | 2026-08-29 | Thiết lập bounded-context registry và trạng thái ACTIVE/SCAFFOLDED. | Sprint 0/1 foundation |
| 1.1.0 | 2026-09-09 | Thêm maintenance-note convention và cập nhật trạng thái Checkout Sprint 3. | DOC-20260909-FEATURE-MAINTENANCE-NOTES |
