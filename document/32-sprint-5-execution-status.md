# Sprint 5 — Fulfillment & Shipping execution status

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Đối soát scope Sprint 5 đã được triển khai sớm trong Sprint 4 và khóa phần tích hợp carrier thật theo credential gate.

## 1. Kết luận

Engineering scope Sprint 5 đạt **100% theo phạm vi V1 đã chốt**. Không tạo lại module/bảng/API vì Fulfillment và Shipping fallback đã được hoàn thiện, kiểm thử và ghép Admin trong Sprint 4.

Tích hợp tạo vận đơn/tracking webhook GHN/GHTK thật không phải blocker đóng Sprint: OWNER đã quyết định dùng phí nội bộ hoặc `MANUAL_EXTERNAL` cho đến khi có credential và pickup configuration hợp lệ. Adapter thật chỉ được kích hoạt bằng một change riêng sau khi có key; không mock production success.

## 2. Function matrix

| ID | Function | Trạng thái | Evidence |
| --- | --- | --- | --- |
| FUL-01 | Một Fulfillment cho một Order/warehouse | DONE | Unique order; warehouse snapshot; branch scope |
| FUL-02 | Pick → Pack → Ship atomic | DONE | State machine, expected version, idempotency; ship commit stock cùng transaction |
| FUL-03 | Delivered → Completed | DONE | Auto-complete worker theo env và manual complete sau giao + đủ tiền |
| FUL-04 | Delivery failed → return warehouse | DONE | Reason bắt buộc; `SELLABLE` mới restock, damaged/missing chỉ trace |
| SHP-01 | Phí giao online | DONE | Free 10 km; tier 50k/100k/200k; snapshot fee/ETA |
| SHP-02 | Manual external/xe khách | DONE | Admin ghi fee/ETA/provider/note; quote mở lại để customer tự xác nhận |
| SHP-03 | Tracking thủ công | DONE | carrier/tracking fields, Admin action và search |
| SHP-04 | GHN/GHTK live dispatch/webhook | DEFERRED-BY-DECISION | Chờ credential; rate adapter fail-safe đã có, không bật giả |

## 3. Invariant đã kiểm chứng

- Bank transfer chỉ ship khi Payment `SUCCESS`; COD được ship pending và chỉ complete sau khi đã thu đủ.
- Ship giảm đồng thời `on_hand + reserved`, commit reservation, append movement/history; retry không double-decrement.
- Giao thất bại không tự nhập kho. Chỉ `receive-return` sau kiểm tra thực tế mới quyết định restock.
- `MANUAL_EXTERNAL` phải qua quote do Admin cập nhật và customer confirm; phí/ETA đã confirm được snapshot vào Order.
- `COMPLETED` mới là recognized revenue theo baseline V1.

## 4. Deferred carrier checklist

Chỉ mở khi OWNER cung cấp provider + sandbox/production key + pickup branch mapping:

- [ ] Chốt GHN hay GHTK đầu tiên và môi trường sandbox.
- [ ] Mapping kích thước/cân nặng, địa chỉ pickup và service code.
- [ ] Create/cancel shipment idempotent; lưu external request/reference đã redact.
- [ ] Webhook signature, event dedupe, status/error mapping và retry/dead-letter.
- [ ] Reconciliation tracking với fulfillment; không cho webhook vượt state machine nội bộ.
- [ ] OpenAPI, Admin tracking UI, unit/integration/sandbox E2E và runbook.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-13 | Đối soát Sprint 5 đã được hấp thụ vào Sprint 4; carrier live giữ ở credential gate. | S5-20260913-SCOPE-RECONCILIATION |
