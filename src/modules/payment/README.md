# Payment module

> **Document version:** 1.2.0  
> **Last updated:** 2026-09-24  
> **Change summary:** Payment có thể chuyển REFUNDED do module Return; IPN VNPay và review thủ công không ghi đè trạng thái này.

## Responsibility and boundary

- Public entries: Guest/Account đọc Payment, tạo signed evidence upload và finalize bằng chứng; Admin list/detail/confirm/reject.
- OpenAPI operations nằm trong `Guest Payments`, `Account Payments`, `Admin Payments` và được xuất sang hai SDK FE.
- Source of truth: `payments`; child append-only `payment_transactions`; bằng chứng tin cậy liên kết `payment_evidences -> media_assets`.
- Refund thủ công thuộc module Return (`../return/README.md`): Return ghi `refunds` và chỉ đổi `payments.status`/`orders.payment_status` sang `REFUNDED` khi tổng refund SUCCEEDED bằng `received_amount`. Payment coi `REFUNDED` là trạng thái kết thúc: IPN VNPay đến muộn trả `ALREADY_CONFIRMED`, review thủ công bị từ chối. Chưa có refund qua gateway và settlement.
- Không tích hợp settlement trong wave này. Bank account/QR production chưa được phát hành khi chưa có credential được duyệt.

## Invariants

- V1 đúng một Payment/Order; số phải thu snapshot bằng `orders.grand_total`; tiền dùng `decimal(19,2)`.
- Chuyển khoản chỉ được `SUCCESS` sau evidence + Admin xác nhận đúng đủ tiền. Thiếu/thừa chuyển `NEED_REVIEW`.
- COD không có evidence chuyển khoản và chỉ được xác nhận thu đủ khi Order đã `DELIVERED`.
- Evidence không tự chứng minh tiền đã vào tài khoản; asset phải được object-storage adapter verify trước khi lưu.
- Payment và Order summary status, transaction ledger và audit phải được ghi atomically.

## Concurrency, security and recovery

- Review khóa Payment row, chạy transaction `SERIALIZABLE`, dùng optimistic `expectedVersion` và retry serialization hữu hạn.
- Cùng `Idempotency-Key` + cùng request hash trả kết quả cũ; khác payload trả `409`.
- Admin query luôn áp GLOBAL/BRANCH scope ở backend; Guest/Account dùng cart ownership, không tin order ID đơn lẻ.
- Signed upload sống ngắn; API không proxy file. Log/audit không lưu token hoặc raw credential.
- `PAYMENT_TIMEOUT_MINUTES` mặc định 30 phút. Worker chỉ expire chuyển khoản `PENDING` chưa có evidence; reservation/payment/order/fulfillment và audit đổi cùng transaction.

## Change checklist

- Khi đổi state/amount/COD gate: cập nhật constants, migration CHECK, state-machine doc và PostgreSQL integration test.
- Khi đổi DTO/operation: export OpenAPI, sync contract và regenerate cả Admin/Client; không sửa generated code.
- Khi đổi transaction: giữ lock order, version/idempotency semantics, audit và append-only ledger.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.2.0 | 2026-09-24 | REFUNDED là trạng thái kết thúc; refund thủ công do Return sở hữu. |
| 1.1.0 | 2026-09-13 | Thêm payment-expiry worker, race evidence guard và unit test. |
| 1.0.0 | 2026-09-12 | Tạo maintenance map cho Payment V1 persisted. |
