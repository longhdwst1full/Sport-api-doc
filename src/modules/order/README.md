# Order module — maintenance note

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-11
>
> **Change summary:** Mô tả Order foundation, ownership/idempotency, branch scope và ranh giới reservation.

## Phạm vi hiện tại

- Guest/Customer tạo đúng một Order từ checkout `CONFIRMED` có reservation `ACTIVE` chưa hết hạn.
- Order snapshot item/combo component, giá đã gồm VAT, địa chỉ và người nhận; không đọc ngược catalog/address book để sửa lịch sử.
- Admin list/detail theo `order.view` và GLOBAL/BRANCH scope; search server-side theo mã đơn, tên, SĐT, email.
- Payment confirmation, fulfillment transition, cancel/release và return/refund thuộc các wave tiếp theo.

## Cấu trúc

| Vị trí | Vai trò |
| --- | --- |
| `controllers/order.controller.ts` | Guest/Account placement và Admin read contract. |
| `dto/order.dto.ts` | OpenAPI DTO, page/search/status group và response snapshot. |
| `services/order.service.ts` | Ownership, idempotency, transaction, snapshot và branch scope. |
| `order.constants.ts` | Status, status-group, payment/fulfillment state và audit action. |

## Invariant quan trọng

- `orders.checkout_session_id` và `orders.reservation_id` đều unique.
- Lock order là checkout → reservation trước khi kiểm tra/tạo Order.
- Replay vẫn kiểm tra ownership; cùng key khác intent trả `409`.
- Checkout và cart chỉ chuyển `COMPLETED/CONVERTED` trong cùng transaction tạo Order.
- Reservation vẫn `ACTIVE`; expiry worker bỏ qua reservation đã có Order. Chỉ cancel/payment timeout hoặc fulfillment được release/commit ở wave sau.
- `order_status_history` append-only; không hard-delete Order hoặc history.
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
| 1.0.0 | 2026-09-11 | Tạo Order foundation và maintenance invariant. | API-20260911-ORDER-FOUNDATION |

