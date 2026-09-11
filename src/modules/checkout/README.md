# Checkout module — maintenance note

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-10
>
> **Change summary:** Bổ sung semantics lỗi cạnh tranh PostgreSQL và evidence không oversell/idempotency trên Supabase.

## Trách nhiệm

Module này sở hữu vòng đời trước Order:

1. Đồng bộ giỏ hàng và tạo báo giá checkout.
2. Chọn một branch/warehouse đủ toàn bộ hàng; V1 giữ invariant `1 Branch = 1 Warehouse`.
3. Tính hoặc chờ tư vấn phí giao hàng.
4. Khách xác nhận để tạo inventory reservation có TTL.
5. Release thủ công hoặc expire tự động để trả `reserved`.

Module **chưa** phải Order/Payment/Fulfillment. Không ghi nhận doanh thu, không trừ `on_hand` và không coi checkout/reservation là đơn hoàn thành.

## Entry points và ownership

| File | Vai trò |
| --- | --- |
| `checkout.controller.ts` | HTTP mapping cho Guest, Account và Admin consultation. |
| `checkout.service.ts` | Quote/read/manual consultation orchestration. |
| `inventory-reservation.service.ts` | Confirm/release reservation, idempotency và inventory transaction. |
| `reservation-expiry.controller.ts` | Internal cron endpoint; không thuộc OpenAPI public. |
| `reservation-expiry.service.ts` | Claim batch hết hạn, release reserved, đổi lifecycle và ghi audit atomic. |
| `checkout.dto.ts` | Request/response contract; nguồn sinh OpenAPI và FE SDK. |
| `checkout.constants.ts` | Status, payment method, audit action và reason code dùng tập trung. |

## State flow V1

```text
QUOTED ──confirm──> CONFIRMED ──TTL worker──> EXPIRED
   │                     └────manual release──> reservation RELEASED
   └──needs consultation──> AWAITING_SHIPPING_CONSULTATION
                              └──Admin chốt phí──> QUOTED
```

- `CONFIRMED` nghĩa là hàng đang được giữ qua `inventory_balances.reserved`; chưa giảm `on_hand`.
- `available = on_hand - reserved`; mọi thay đổi reserved phải atomic và dùng optimistic/concurrency guard.
- Khi Sprint Order được triển khai, thời điểm commit/trừ `on_hand` phải theo rule thanh toán/giao hàng đã chốt, không nhét tạm vào Checkout.

## Reservation expiry worker

- Scheduler gọi `GET /api/v1/internal/jobs/reservations/expire` bằng Bearer `CRON_SECRET`.
- `FOR UPDATE SKIP LOCKED` chia reservation giữa các worker chạy song song.
- Inventory balance được lock theo thứ tự warehouse/SKU cố định để giảm deadlock.
- Cùng một transaction phải: decrement `reserved` → mark reservation `EXPIRED` → mark checkout `EXPIRED` → append audit.
- Chỉ retry lỗi serialization/write conflict. Invariant mismatch phải fail và báo vận hành, không được bỏ qua.
- `hasMore=true` báo scheduler còn batch; không tăng batch vô hạn vì môi trường serverless có timeout.
- SQLSTATE `40001` có thể được Prisma trả trực tiếp cho raw row-lock query hoặc bọc trong `P2010`/`P2034`; API phải chuẩn hóa thành `409`, không để lọt thành lỗi 500.

Tham khảo vận hành tại `document/29-reservation-expiry-worker-runbook.md`.

## Cấu hình

| Env | Ý nghĩa |
| --- | --- |
| `CHECKOUT_RESERVATION_TTL_MINUTES` | TTL giữ hàng, mặc định nghiệp vụ hiện tại là 30 phút. |
| `RESERVATION_EXPIRY_JOB_ENABLED` | Bật/tắt worker. Khi tắt endpoint trả no-op. |
| `RESERVATION_EXPIRY_JOB_BATCH_SIZE` | Số reservation tối đa mỗi lần chạy. |
| `CRON_SECRET` | Secret riêng cho internal scheduler; không dùng token người dùng. |

Giá trị phải được đồng bộ ở `.env.example`, `.env.local.example` và cấu hình production. Không hard-code giá trị môi trường vào service.

## Checklist khi sửa

- [ ] Không phá ownership Guest/Account cart.
- [ ] `Idempotency-Key` vẫn chống tạo/confirm/release trùng.
- [ ] Mutation inventory và lifecycle cùng transaction.
- [ ] Lock order không đổi tùy dữ liệu đầu vào.
- [ ] Branch scope của Admin consultation được kiểm tra server-side.
- [ ] Thêm/cập nhật test success, replay, concurrent change, expiry và disabled-job.
- [ ] Nếu contract thay đổi: xuất OpenAPI và regenerate cả Admin/Client; không sửa generated file.
- [ ] Nếu schema/persistence thay đổi: migration, model docs, change log và workbook phải cùng task.

## Revision history

| Version | Date | Change summary | Source |
| --- | --- | --- | --- |
| 1.1.0 | 2026-09-10 | Ghi nhận mapping lỗi serialization và integration test tranh SKU cuối/idempotency trên Supabase. | API-20260910-CHECKOUT-CONCURRENCY |
| 1.0.0 | 2026-09-09 | Tạo maintenance note cho Checkout/Reservation expiry. | DOC-20260909-FEATURE-MAINTENANCE-NOTES |
