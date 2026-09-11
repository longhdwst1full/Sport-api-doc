# Sprint 4 — Order, Payment & Fulfillment Safe Flow

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-11
>
> **Change summary:** Hoàn thành S4.1 Order foundation, OpenAPI/SDK và Admin/Storefront round-trip; giữ Payment/Fulfillment ở các wave kế tiếp.

## 1. Mục tiêu Sprint

Biến checkout đã `CONFIRMED` và reservation `ACTIVE` thành đơn hàng có lịch sử bất biến, thanh toán một lần và fulfillment một kho. Sprint chỉ hoàn thành khi:

1. tạo Order idempotent từ checkout còn hiệu lực;
2. snapshot item/combo/address/price/shipping/VAT vào Order;
3. hỗ trợ `BANK_TRANSFER` và `COD` đúng state machine;
4. Admin xử lý hàng theo `PENDING → PICKING → PACKED → SHIPPED → DELIVERED`;
5. tại `SHIPPED/HANDED_OVER`, giảm `on_hand` và `reserved`, commit reservation và ghi movement/history trong cùng transaction;
6. Storefront và Admin chỉ gọi SDK sinh từ OpenAPI, có đủ loading/empty/error/forbidden/stale states.

## 2. Scope và out-of-scope

### Trong Sprint 4

- Order: create/read/list/detail/cancel và status history.
- Payment: tạo payment một lần/order, hướng dẫn chuyển khoản, evidence, Admin confirm/reject, COD collection confirmation.
- Fulfillment: create/pick/pack/ship/delivery update/delivery failed/returned-to-warehouse.
- Inventory: commit reservation tại ship; restock chỉ sau hàng hoàn thực nhận và condition hợp lệ.
- Storefront: checkout success → order detail/payment instruction; guest/account order access.
- Admin: order queue/detail timeline, payment queue, fulfillment actions theo permission/scope.

### Chưa làm trong Sprint 4

- Cổng thanh toán production/webhook thật khi chưa có merchant credential.
- Gọi API GHN/GHTK thật khi chưa có key/pickup config; tiếp tục snapshot provider/fallback/manual đã chốt.
- Partial fulfillment/split shipment, split payment, nested combo.
- Return/refund đầy đủ, e-invoice, settlement với sàn và accounting ledger tổng hợp.

## 3. Bảng vật lý dự kiến

| Bảng | Owner | Mục đích | Invariant chính |
| --- | --- | --- | --- |
| `orders` | Order | Aggregate và snapshot tổng tiền/trạng thái | `order_no`, idempotency unique; một checkout/reservation chỉ tạo một order |
| `order_items` | Order | Dòng sản phẩm/combo bất biến | quantity > 0; money decimal; không đọc ngược catalog để sửa lịch sử |
| `order_item_components` | Order | Snapshot component của combo | ship/restock theo component vật lý |
| `order_addresses` | Order | Snapshot địa chỉ nhận hàng | không thay đổi khi customer sửa address book |
| `order_status_history` | Order | Append-only transition trail | sequence unique/order; không update/delete |
| `payments` | Payment | Một payment/order trong V1 | expected amount = order grand total; chỉ một SUCCESS |
| `payment_transactions` | Payment | Attempt/confirm/webhook append-only | idempotency/external event unique trong provider |
| `payment_evidences` | Payment | Bằng chứng chuyển khoản | evidence không tự đồng nghĩa SUCCESS |
| `fulfillments` | Fulfillment | Một fulfillment/order/warehouse | warehouse phải bằng warehouse snapshot của order |
| `fulfillment_status_history` | Fulfillment | Append-only operation timeline | transition tuần tự và có actor/reason |

Không thêm bảng `system_settings`; TTL/hold/timeout kỹ thuật dùng env đã validate theo D45. Không có `deleted_at`; transaction/history dùng cancel/reverse/terminal status.

## 4. Transaction và lock order

### Tạo Order

1. validate idempotency key và payload hash;
2. lock checkout → reservation;
3. xác nhận checkout `CONFIRMED`, reservation `ACTIVE`, chưa hết hạn và cùng cart/customer;
4. snapshot Order/items/components/address;
5. tạo đúng một Payment theo method đã snapshot;
6. tạo history/outbox/audit;
7. commit hoặc rollback toàn bộ.

Tạo Order chưa giảm `on_hand`; reservation tiếp tục `ACTIVE` theo D01.

### Ship/Handover

Lock cố định theo thứ tự `order → payment → fulfillment → reservation → inventory_balances(sorted variant_id)`. Trong một transaction:

1. kiểm tra transition và payment precondition (`BANK_TRANSFER=SUCCESS`; `COD` được pending);
2. giảm đồng thời `on_hand` và `reserved` theo component vật lý;
3. chuyển reservation `ACTIVE → COMMITTED`;
4. append `inventory_movements` với idempotency unique;
5. chuyển fulfillment `PACKED → SHIPPED` và append history;
6. đồng bộ order fulfillment/status summary;
7. audit rồi commit.

Retry cùng key/payload trả kết quả cũ; cùng key khác payload trả `409`. Bất kỳ bước nào lỗi phải rollback, không cho trạng thái giao hàng và tồn kho lệch nhau.

## 5. API/function matrix dự kiến

| ID | Operation | Actor/scope | Done khi |
| --- | --- | --- | --- |
| ORD-01 | Create order from checkout | Guest/Customer OWN | Snapshot + payment + history atomic, idempotent |
| ORD-02 | Read/cancel own order | Guest token/Customer OWN | Không IDOR; cancel hợp lệ release reservation |
| ORD-03 | Admin order list/detail | `order.view`, GLOBAL/BRANCH | Server filter/page/sort; timeline đầy đủ |
| ORD-04 | Admin order transition | `order.manage`, GLOBAL/BRANCH | Named transition + expected version |
| PAY-01 | Payment instruction | Guest token/Customer OWN | BANK_TRANSFER/COD mapping đúng contract |
| PAY-02 | Upload/finalize evidence | Guest token/Customer OWN | File policy + hash; chuyển awaiting confirmation |
| PAY-03 | Confirm/reject/collect | `payment.confirm`, GLOBAL/BRANCH | Một lần đủ tiền; thiếu/thừa → NEED_REVIEW |
| FUL-01 | Picking list/detail | `fulfillment.view/pick`, WAREHOUSE | Chỉ đúng warehouse scope |
| FUL-02 | Pick/pack/ship | permission theo action | Ship và commit kho atomic/idempotent |
| FUL-03 | Delivered/failure/return receive | `fulfillment.delivery_update`, BRANCH | reason bắt buộc; restock theo inspection |

## 6. Trình tự thực hiện

### S4.0 — Decision/schema review

- Chốt ba decision gate ở mục 7.
- Review DBML/table catalog/cardinality/index/RLS/retention.
- Viết migration forward-only và PostgreSQL constraint/concurrency tests.

### S4.1 — Order foundation

- [x] Prisma/migration cho 5 Order tables; áp dụng Supabase dev và bật RLS deny-by-default.
- [x] Create Order idempotent guest/account; ownership và unique checkout/reservation.
- [x] Admin list/detail theo branch scope, 5 tab và search server-side order/recipient.
- [x] OpenAPI export + Admin/Storefront SDK generation; Storefront chỉ clear cart sau khi Order tạo thành công.
- [ ] Cancel own order và guest/account order detail route; thực hiện cùng release reservation trong wave tiếp theo.

### S4.2 — Payment

- Payment/evidence/transaction persistence và state policy.
- BANK_TRANSFER manual confirmation + COD collection.
- Admin payment queue/detail/action; Storefront instruction/evidence state.

### S4.3 — Fulfillment và stock commit

- Fulfillment persistence và transition policy.
- Atomic ship transaction + movement/reconciliation/concurrency tests.
- Admin picking/packing/shipping/delivery UI.

### S4.4 — Hardening/close

- API unit/integration/E2E; FE generated-contract drift, build/Storybook/browser E2E.
- RLS audit, permission/scope/IDOR, idempotency/concurrency evidence.
- Cập nhật DBML/catalog/relationship/decision/change-log/workbook/OpenAPI/status.

## 7. Decision gate cho các wave còn lại

### S4-D01 — Order completion/revenue

Đề xuất: `DELIVERED` chưa ghi nhận doanh thu ngay; tự chuyển `COMPLETED` sau 3 ngày không có khiếu nại, hoặc Admin có quyền xác nhận sớm. Hold time dùng env `ORDER_COMPLETION_HOLD_HOURS=72`.

### S4-D02 — Bank transfer V1

Đề xuất: chuyển khoản thủ công một lần đủ tiền, customer có thể gửi evidence; Admin xác nhận reference/amount rồi mới `SUCCESS`. Chưa tích hợp gateway/QR production; COD vẫn theo D34.

### S4-D03 — Guest order access

Đề xuất: khi tạo Order trả raw guest access token đúng một lần, database chỉ lưu hash. Guest dùng `order_no + token` để xem/hủy trước payment; chưa gửi SMS/email tự động khi chưa có provider. Account chỉ truy cập order thuộc chính customer đã link.

Order foundation không phụ thuộc completion worker hoặc guest read token nên đã được triển khai theo xác nhận ngày 2026-09-11. Chưa tạo Payment/Fulfillment completion worker và guest read/cancel API cho đến khi các decision tương ứng được xác nhận hoặc sửa rõ ràng.

## 8. Definition of Done Sprint 4

- [x] Order migration chạy trên Supabase dev; RLS deny-by-default; migration forward-only rõ.
- [x] Tạo Order retry-safe, không tạo Order trùng; Payment aggregate thực hiện ở S4.2.
- [ ] Payment state/amount/reference/evidence/audit đúng một lần đủ tiền.
- [ ] Ship atomic: không double decrement và không `reserved > on_hand`/âm tồn.
- [ ] Permission + branch/warehouse/OWN scope test pass.
- [ ] API error envelope/code ổn định, message tiếng Việt.
- [x] OpenAPI sinh từ NestJS; Admin/Client SDK regenerate, không sửa tay.
- [ ] Admin/Storefront đủ loading/empty/error/forbidden/stale/success.
- [ ] Unit + PostgreSQL integration + concurrency + API E2E + browser E2E pass.
- [ ] DBML/catalog/relationship/decision/change-log/workbook/status đồng bộ.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.1.0 | 2026-09-11 | Hoàn thành Order schema/create/admin list-detail/OpenAPI/SDK và Storefront placement round-trip; ghi rõ phần cancel/read còn lại. | API-20260911-ORDER-FOUNDATION |
| 1.0.0 | 2026-09-10 | Tạo Sprint 4 plan, dependency order, transaction/lock rule và ba decision gate trước migration. | PLAN-20260910-SPRINT4 |
