# Sprint 2 — Branch, Warehouse & Inventory Core

> **Document version:** 1.2.0
>
> **Last updated:** 2026-09-06
>
> **Change summary:** Hoàn tất engineering scope Sprint 2: transfer end-to-end API/Admin, D11, migration Supabase, permissions, OpenAPI generated SDK và automated gates.

## 1. Sprint goal và exit milestone

Sprint 2 chỉ gồm `Branch/Warehouse + Inventory Balance/Ledger/Transfer`. Reservation checkout thuộc Sprint 3; Order/Payment thuộc Sprint 4; không kéo các module đó vào sớm.

Milestone `M2 — Stock Safe` đạt khi:

- Tồn được quản lý theo đúng `warehouse_id + product_variant_id`, không có `Product.quantity`.
- Balance đọc nhanh luôn đối chiếu được với ledger bất biến.
- Điều chỉnh và chuyển kho có chứng từ, actor, reason, idempotency và audit.
- Mọi mutation khóa balance theo thứ tự ổn định và không lost-update khi chạy đồng thời.
- Branch scope được enforce tại backend; Admin chỉ hiển thị affordance theo permission.

## 2. Function matrix

| ID | Function | Trạng thái | Evidence hiện tại | Còn thiếu để Done |
| --- | --- | --- | --- | --- |
| ORG-01 | Branch + một warehouse | DONE-CORE | PostgreSQL repository; create/update/activate/deactivate atomic; optimistic version; Admin CRUD | QA acceptance environment chung |
| INV-01 | Balance theo kho | DONE-CORE | API filter/pagination; branch scope; derived available/low stock; Admin loading/empty/error/filter/page; reconciliation integration pass | QA acceptance environment chung |
| INV-02 | Opening/manual receipt | DONE-CORE | CORRECTION/OPENING_BALANCE/MANUAL_RECEIPT; receipt reference unique theo kho; opening chỉ trước movement đầu; RECEIVE ledger + audit atomic | QA acceptance environment chung |
| INV-03 | Stock adjustment | DONE-CORE | Serializable transaction; row lock; idempotent replay/conflict; immutable movement; Admin form/history; D11 branch decrease ≤10/SKU/lệnh, GLOBAL được vượt | QA acceptance environment chung |
| INV-LEDGER | Movement ledger | DONE-CORE | Cursor API; warehouse/SKU/type/reference/time filter; scope; Admin ledger tab; database integration pass | Cursor regression qua HTTP |
| INV-07 | Stock transfer | DONE-CORE | DRAFT→SUBMITTED→SHIPPED→RECEIVED; full ship; sellable/damaged receive; OUT/IN ledger; scope, audit, idempotency, optimistic version; Admin workflow | QA acceptance environment chung |
| INV-CONC | Concurrency/reconciliation | DONE-ENGINEERING | Serializable transaction + deterministic row lock + optimistic version; P2034 trả 409; reconciliation/schema integration pass | Load/concurrent acceptance trên QA DB riêng (không chạy phá dữ liệu Supabase dùng chung) |

## 3. API contract slice

| Method/path | Operation ID | Permission | Scope |
| --- | --- | --- | --- |
| `GET /api/v1/admin/inventory/balances` | `listInventoryBalances` | `inventory.stock.view` | GLOBAL/BRANCH |
| `GET /api/v1/admin/inventory/movements` | `listInventoryMovements` | `inventory.stock.view` | GLOBAL/BRANCH |
| `GET /api/v1/admin/inventory/adjustments` | `listStockAdjustments` | `inventory.stock.view` | GLOBAL/BRANCH |
| `GET /api/v1/admin/inventory/adjustments/{id}` | `getStockAdjustment` | `inventory.stock.view` | GLOBAL/BRANCH |
| `POST /api/v1/admin/inventory/adjustments` | `createStockAdjustment` | `inventory.stock.adjust` | GLOBAL/BRANCH |
| `GET /api/v1/admin/inventory/transfers` | `listStockTransfers` | `inventory.transfer.view` | GLOBAL/BRANCH liên quan |
| `GET /api/v1/admin/inventory/transfers/{id}` | `getStockTransfer` | `inventory.transfer.view` | GLOBAL/BRANCH liên quan |
| `POST /api/v1/admin/inventory/transfers` | `createStockTransfer` | `inventory.transfer.create` | GLOBAL/kho nguồn |
| `POST /api/v1/admin/inventory/transfers/{id}/submit` | `submitStockTransfer` | `inventory.transfer.create` | GLOBAL/kho nguồn |
| `POST /api/v1/admin/inventory/transfers/{id}/ship` | `shipStockTransfer` | `inventory.transfer.ship` | GLOBAL/kho nguồn |
| `POST /api/v1/admin/inventory/transfers/{id}/receive` | `receiveStockTransfer` | `inventory.transfer.receive` | GLOBAL/kho đích |

Admin tiếp tục generate Orval từ YAML; không viết tay endpoint/DTO. `Idempotency-Key` của create transfer được truyền qua generated hook request options.

## 4. Quyết định OWNER đã chốt

### S2-D01 — Transfer lifecycle

ERD hiện đã dự kiến `DRAFT → SUBMITTED → SHIPPED → RECEIVED`, có `requested_qty`, `shipped_qty`, `received_qty`, `damaged_qty`.

Đã chốt và triển khai. `received_qty` là số hàng tốt; `damaged_qty` là hàng hỏng, vì vậy `TRANSFER_IN` đúng bằng `received_qty`. Không partial shipment; `received + damaged = shipped`.

### S2-D02 — Adjustment approval threshold D11

D11 đang đề xuất maker-checker khi giảm hơn 10 đơn vị hoặc giá vốn hơn 5 triệu nhưng approval engine chưa nằm trong Sprint 2 đã chốt.

Đã chốt và triển khai: `BRANCH_MANAGER` giảm tối đa 10 đơn vị mỗi SKU/lệnh; principal GLOBAL/OWNER được post vượt ngưỡng, reason và audit vẫn bắt buộc. Không kéo Approval module vào Sprint 2.

### S2-D03 — Transfer branch scope

Đã chốt và triển khai: `OWNER` toàn bộ; `BRANCH_MANAGER` nguồn create/submit/ship, đích receive; `STAFF` không có transfer permission. Backend kiểm tra scope theo từng transition, Admin chỉ ẩn/hiện affordance.

## 5. Engineering checklist

### Backend

- [x] Balance không nằm trên Product.
- [x] Branch scope server-side cho balance/ledger/adjustment query và mutation.
- [x] Adjustment atomic, idempotent và có audit.
- [x] Ledger/adjustment history read API với filter và pagination phù hợp.
- [x] Receipt type/reference; duplicate external document bị chặn theo warehouse.
- [x] Transfer migration, service, transitions và audit.
- [x] Schema/permission integration; unit scope query không lộ transfer ngoài branch.
- [x] Concurrent transfer/adjustment dùng SERIALIZABLE + row lock + optimistic version; P2034 map 409 và có unit regression.
- [x] Reconciliation `opening + movement delta = on_hand`; seed mới ghi opening movement và migration đã repair dữ liệu demo lịch sử.

### Admin

- [x] Tồn kho có search, warehouse filter và server pagination.
- [x] Sổ kho có filter, cursor next/previous và trạng thái loading/empty/error.
- [x] Danh sách/chi tiết phiếu điều chỉnh.
- [x] Form adjustment dùng active-search warehouse/SKU, kể cả SKU chưa có balance.
- [x] Transfer list/detail/create/submit/ship/receive UI; multi-SKU RHF/Yup, active search và confirm hành động nhạy cảm.
- [x] Storybook loaded/empty/recoverable-error và transfer review cho layout Inventory.

### Quality gate

- [x] API unit: 40 suite/150 test; gồm transfer service/query, full-receive/damaged, scope, D11 và conflict retry mapping.
- [x] PostgreSQL integration: 6 suite/26 test; gồm schema/RLS/constraint/permission transfer trên Supabase.
- [x] E2E: 2 suite/11 test pass trên Supabase, gồm auth, IAM, catalog, organization và inventory read/write contract.
- [x] OpenAPI generate hai lần không drift.
- [x] Admin generate/lint/test/build/Storybook.
- [x] Migration apply trên Supabase: 17 migration, status up-to-date; permission data migration tự cấp quyền, đồng bộ metadata catalog và invalidate token role-holder cũ.
- [x] Composite PK sau D43 được đối soát; seed demo chạy lặp không tạo duplicate junction rows.
- [x] Workbook annotate + Change Log cho read model, actor forward-fix, receipt, reconciliation và composite PK repair.
- [x] GitNexus impact/detect-changes cho API và Admin; mức HIGH đúng với 15 API + 13 Admin flow đã được chạy full gate.
- [ ] BA/QA evidence trên environment chung.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.2.0 | 2026-09-06 | Chốt S2-D01/02/03; hoàn tất transfer API/Admin, D11, migration 15, generated SDK và evidence test. | DBAPI-20260906-STOCK-TRANSFER / D11 |
| 1.1.3 | 2026-09-06 | Cập nhật full gate và GitNexus blast radius; giữ Transfer/D11 ở trạng thái chờ xác nhận. | S2-GATE-20260906 |
| 1.1.2 | 2026-09-06 | Khôi phục PK bảng nối sau D43 và thêm evidence seed repeatability. | DB-20260906-REPAIR-COMPOSITE-PK |
| 1.1.1 | 2026-09-05 | Repair/seed opening ledger và chứng minh balance = tổng movement trên Supabase. | DATA-20260905-INVENTORY-OPENING-RECONCILIATION |
| 1.1.0 | 2026-09-05 | Hoàn thiện read model, Admin Inventory, receipt D26, migration Supabase và evidence test hiện tại. | API-20260905-INVENTORY-READ-MODEL / DBAPI-20260905-INVENTORY-RECEIPT |
| 1.0.0 | 2026-09-05 | Tạo execution baseline/checklist Sprint 2 và ghi hai quyết định chờ OWNER. | S2-BASELINE-20260905 |
