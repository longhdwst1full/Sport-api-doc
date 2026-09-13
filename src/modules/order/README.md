# Order module — maintenance note

> **Document version:** 1.3.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Thêm Admin confirm và worker auto-complete sau hold time cấu hình.

## Phạm vi hiện tại

- Guest/Customer tạo đúng một Order từ checkout `CONFIRMED` có reservation `ACTIVE` chưa hết hạn; guest nhận lại cart token làm access token của Order trên đúng trình duyệt đặt hàng.
- Order snapshot item/combo component, giá đã gồm VAT, địa chỉ và người nhận; không đọc ngược catalog/address book để sửa lịch sử.
- Admin list/detail theo `order.view` và GLOBAL/BRANCH scope; search server-side theo mã đơn, tên, SĐT, email.
- Guest/Customer xem và hủy Order của chính mình; Admin cancel theo branch scope. Cancel chỉ hợp lệ trước payment/fulfillment và release reservation atomically.
- Admin được manual complete bất kỳ thời điểm nào sau khi Order/Fulfillment đã `DELIVERED` và Payment `SUCCESS`; reason + audit bắt buộc. Auto-complete 72 giờ thuộc worker ở wave Fulfillment.
- Admin confirm Order sau khi payment policy hợp lệ; Fulfillment đảm nhiệm pick/pack/ship/delivery. Return/refund đầy đủ thuộc wave tiếp theo.
- Worker auto-complete chạy sau hold time; manual complete vẫn giữ điều kiện DELIVERED + SUCCESS + reason/audit.

## Cấu trúc

| Vị trí | Vai trò |
| --- | --- |
| `controllers/order.controller.ts` | Guest/Account placement/read/cancel và Admin read/transition contract. |
| `dto/order.dto.ts` | OpenAPI DTO, page/search/status group và response snapshot. |
| `services/order.service.ts` | Ownership, idempotency, transaction, snapshot và branch scope. |
| `services/order-completion.service.ts` | Claim và auto-complete Order đã giao/đã thu tiền sau hold time. |
| `controllers/order-maintenance.controller.ts` | Internal cron endpoint; không thuộc OpenAPI FE. |
| `order.constants.ts` | Status, status-group, payment/fulfillment state và audit action. |

## Invariant quan trọng

- `orders.checkout_session_id` và `orders.reservation_id` đều unique.
- Lock order là checkout → reservation trước khi kiểm tra/tạo Order.
- Replay vẫn kiểm tra ownership; cùng key khác intent trả `409`.
- Checkout và cart chỉ chuyển `COMPLETED/CONVERTED` trong cùng transaction tạo Order.
- Reservation vẫn `ACTIVE`; expiry worker bỏ qua reservation đã có Order. Chỉ cancel/payment timeout hoặc fulfillment được release/commit ở wave sau.
- `order_status_history` append-only; không hard-delete Order hoặc history.
- Transition ghi `idempotency_key + request_hash`; cùng key/cùng intent replay, cùng key/khác intent trả `409`.
- Intent transition gồm action, Order ID, `expectedVersion` và reason đã trim; đổi bất kỳ trường nào với cùng key phải trả `409`.
- Cancel lock theo `order → reservation → inventory_balances(sorted variant_id)` và release counter/history/audit trong cùng serializable transaction.
- Complete sớm không tự suy diễn payment; cả ba state `DELIVERED/SUCCESS/DELIVERED` phải đúng tại thời điểm lock.
- Client/Admin chỉ dùng SDK sinh từ OpenAPI, không tự khai báo path/DTO.

## Checklist khi sửa

- [ ] Impact analysis trước khi sửa service/controller/state.
- [ ] Migration, Prisma, DBML, catalog, relationship, change-log và workbook cùng task.
- [ ] Ownership/branch scope/idempotency/concurrency có unit + PostgreSQL integration test.
- [ ] Error message cho người dùng bằng tiếng Việt và giữ error envelope v1.
- [ ] Export OpenAPI rồi regenerate cả Admin/Storefront SDK.
- [ ] Không để checkout TTL worker release reservation đã link Order.

## Revision history

| Version | Date | Change summary | Source |
| --- | --- | --- | --- |
| 1.3.0 | 2026-09-13 | Admin confirm và worker auto-complete sau hold time. | DBAPI-20260913-FULFILLMENT-S43 |
| 1.2.0 | 2026-09-12 | Bỏ giới hạn complete trong ngày; giữ DELIVERED, Payment SUCCESS, reason và audit. | API-20260912-ORDER-GUEST-HARDENING |
| 1.1.1 | 2026-09-11 | Bổ sung expectedVersion vào transition hash, list projection và test branch scope/replay conflict. | API-20260911-ORDER-S41-HARDENING |
| 1.1.0 | 2026-09-11 | Thêm own access/cancel atomic, Admin cancel/manual complete và transition replay-safe. | API-20260911-ORDER-OWN-TRANSITIONS |
| 1.0.0 | 2026-09-11 | Tạo Order foundation và maintenance invariant. | API-20260911-ORDER-FOUNDATION |
