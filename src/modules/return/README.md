# Return & Refund module

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-24
>
> **Change summary:** Kích hoạt Return/Refund V1: phiếu trả (RMA), kiểm hàng, nhập lại tồn có điều kiện và hoàn tiền thủ công.

## Trách nhiệm và phạm vi

- Phiếu trả hàng cho đơn đã giao (DELIVERED/COMPLETED), trả theo từng dòng đơn và số lượng, combo trả nguyên dòng (D09, D32).
- Kiểm hàng khi nhận: SELLABLE nhập lại đúng kho đã xuất, DAMAGED giữ lại (HOLD) hoặc huỷ (WRITE_OFF), MISSING ghi WRITE_OFF với trần tiền 0.
- Hoàn tiền thủ công sau khi nhận hàng: tiền mặt tại quầy hoặc chuyển khoản có mã giao dịch (D58).
- **Ngoài phạm vi V1:** hoàn qua cổng VNPay/PayOS, đổi hàng (exchange), tồn kho hàng lỗi/quarantine, hoàn tiền không cần trả hàng, phiếu trả cho khách vãng lai qua Storefront (D55: nhân viên tạo hộ).

## Entrypoint

| Operation | Quyền | Ghi chú |
| --- | --- | --- |
| `createAccountReturn`, `listAccountReturns`, `getAccountReturn`, `cancelAccountReturn` | đăng nhập, chủ đơn | Chủ đơn xác định qua giỏ hàng của tài khoản, giống Order |
| `listAdminReturns`, `getAdminReturn` | `return.view` | Lọc theo `return_requests.branch_id`, strict |
| `createAdminReturn` | `return.create` | Có `return.decide` thì duyệt ngay, bắt buộc `fault` (D56). Quá hạn cần `return.window.override` + lý do |
| `approveAdminReturn`, `rejectAdminReturn`, `cancelAdminReturn`, `closeAdminReturn` | `return.decide` | |
| `receiveAdminReturn` | `return.receive` | Kiểm đủ mọi dòng trong một lệnh |
| `requestAdminReturnRefund` | `payment.refund.request` | Tạo lượt PENDING, giữ số tiền |
| `confirmAdminReturnRefund`, `failAdminReturnRefund` | `payment.refund.approve` | Xác nhận chỉ sau khi tiền đã rời cửa hàng |

## Dữ liệu

- Ghi: `return_requests`, `return_items`, `return_status_history`, `refunds`, `inventory_balances`/`inventory_movements` (chỉ `RETURN_RESTOCK`), `payments.status` + `orders.payment_status` (chỉ khi hoàn đủ số đã thu), `audit_logs`, `outbox_events`.
- Đọc: `orders`, `order_items`, `order_item_components`, `fulfillments.delivered_at`, `payments`, `product_variants` → `product_categories` → `categories.returnable`.
- Tham số: `RETURN_WINDOW_DAYS` (mặc định 7, D54).

## Trạng thái

```text
REQUESTED ─approve→ APPROVED ─receive→ RECEIVED ─(refund đủ trần)→ REFUNDED ─close→ CLOSED
    │ reject            │ cancel            └──────────────close──────────────→ CLOSED
    ↓                   ↓
 REJECTED           CANCELLED   (cancel cũng được từ REQUESTED)
```

Lượt hoàn: `PENDING → SUCCEEDED | FAILED`. Một phiếu có thể có nhiều lượt; tối đa một lượt PENDING.

## Invariant

- Tối đa một phiếu mở mỗi đơn (partial unique index `return_requests_one_open_per_order_key`).
- Tổng số lượng trả của một dòng đơn qua mọi phiếu chưa REJECTED/CANCELLED ≤ số đã mua; combo phải bằng toàn bộ phần còn lại.
- Chỉ SELLABLE tăng `on_hand`; CHECK `return_items_restock_check` chặn cả ở database.
- Trần phiếu chốt lúc nhận hàng = Σ trần dòng (thành tiền dòng × số trả / số mua, làm tròn xuống) + phí giao ban đầu nếu `fault = SHOP` và chưa phiếu nào của đơn cộng phí giao.
- Số tiền một lượt ≤ min(trần phiếu − PENDING/SUCCEEDED của phiếu, `payments.received_amount` − PENDING/SUCCEEDED của cả payment).
- Chuyển khoản chỉ SUCCEEDED khi có `external_ref`; một `(method, external_ref)` chỉ dùng cho một lượt.

## Transaction, khoá, idempotency

- Serializable + retry 3 lần. Thứ tự khoá: `return_requests` → `orders` → `payments` → `inventory_balances` theo `product_variant_id` tăng dần (cùng thứ tự Fulfillment).
- Tạo phiếu khoá dòng `orders` trước khi kiểm số lượng và phiếu mở.
- `Idempotency-Key` bắt buộc với mọi lệnh ghi. Tạo phiếu: khoá lưu ở `return_requests.idempotency_key`. Lệnh trên phiếu: `(return_request_id, idempotency_key)` trong `return_status_history`. Cùng key + cùng payload trả trạng thái hiện tại; khác payload → `RETURN_IDEMPOTENCY_CONFLICT`.
- Mọi lệnh trên phiếu kiểm `expectedVersion`; lệch → `RETURN_VERSION_CONFLICT`.
- Email (`return.decided`, `return.refund_succeeded`) ghi outbox cùng transaction.

## Bảo mật và audit

- Admin: phạm vi chi nhánh strict (tài khoản chưa gán chi nhánh nhận 403). Khách: chỉ phiếu của đơn thuộc giỏ hàng tài khoản; 404 thống nhất.
- `windowOverrideNote` và ghi chú lượt hoàn không trả cho khách.
- Mỗi lệnh ghi một `audit_logs` (`return.create|approve|reject|cancel|receive|close|refund.request|refund.confirm|refund.fail`) và một dòng lịch sử có actor.

## Mã lỗi

`RETURN_ORDER_NOT_RETURNABLE`, `RETURN_WINDOW_EXPIRED`, `RETURN_OPEN_RETURN_EXISTS`, `RETURN_QUANTITY_EXCEEDED`, `RETURN_PARTIAL_COMBO`, `RETURN_ITEM_NOT_RETURNABLE`, `RETURN_INVALID_TRANSITION`, `RETURN_INVALID_INSPECTION`, `RETURN_VERSION_CONFLICT`, `RETURN_IDEMPOTENCY_CONFLICT`, `REFUND_EXCEEDS_REMAINING`, `REFUND_PENDING_EXISTS`, `REFUND_PAYMENT_NOT_SUCCESS`, `REFUND_METHOD_NOT_ALLOWED`, `REFUND_REFERENCE_REQUIRED`, `REFUND_REFERENCE_USED` — tất cả HTTP 409.

## Test và bằng chứng

- `return.policy.spec.ts`: ma trận chuyển trạng thái đầy đủ, hạn trả, số lượng cộng dồn, combo, kiểm hàng, trần tiền hai tầng, kênh hoàn.
- `services/return-workflow.spec.ts`: replay/xung đột key, version, vượt trần, lượt PENDING thứ hai, mã giao dịch trùng, hoàn đủ → payment REFUNDED, nhập kho thành phần combo, DAMAGED không nhập kho.
- **Chưa có:** integration test PostgreSQL cho CHECK/partial index/khoá đồng thời (chờ DB test riêng). Các unit test chạy trên Prisma giả, không chứng minh hành vi SQL.

## Checklist khi sửa

- Đổi trạng thái/mã: sửa `return.constants.ts` và thêm migration đổi CHECK tương ứng.
- Đổi công thức trần: sửa `return.policy.ts` + spec, cập nhật D57/D60.
- Đổi thứ tự khoá: đối chiếu Fulfillment và Payment để tránh deadlock.
- Báo cáo doanh thu **chưa trừ** tiền hoàn; khi thêm, đọc `refunds` SUCCEEDED thay vì suy từ `payments.status`.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-24 | Kích hoạt Return/Refund V1. | API-20260924-RETURN-REFUND-V1 |
