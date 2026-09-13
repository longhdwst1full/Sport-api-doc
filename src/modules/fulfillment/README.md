# Fulfillment module — maintenance note

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Kích hoạt Fulfillment V1, stock commit và xử lý giao thất bại quay về kho.

## Phạm vi và ranh giới

- V1 có đúng một Fulfillment cho mỗi Order và dùng đúng warehouse đã snapshot/reserve.
- Public entry là Admin list/detail và named transition `pick/pack/ship/deliver/fail-delivery/receive-return`.
- `FulfillmentService` sở hữu trạng thái/timestamp/history; không controller/module khác được update trực tiếp.
- API contract nằm ở tag `Admin Fulfillments`; Admin phải dùng SDK generate từ `document/api/admin/fulfillments.yaml`.

## Invariant

- `PENDING → PICKING → PACKED → SHIPPED → DELIVERED`; giao thất bại đi `SHIPPED → RETURNING_TO_WAREHOUSE → RETURNED_TO_WAREHOUSE`.
- `SHIPPED` khóa aggregate và balance theo SKU ổn định, giảm đồng thời `on_hand + reserved`, commit reservation và ghi movement trong một serializable transaction.
- Bank transfer phải `SUCCESS` trước ship; COD được ship pending và chỉ complete sau khi thu đủ.
- Hàng hoàn chỉ tăng `on_hand` khi condition `SELLABLE`; `DAMAGED/MISSING` vẫn được trace nhưng không trở lại tồn bán.
- Transition nhận `expectedVersion + Idempotency-Key`; history là append-only và key/hash bảo vệ retry khác intent.
- Permission và GLOBAL/BRANCH scope luôn kiểm tra ở Backend.

## Checklist khi sửa

- [ ] Impact analysis trước khi sửa transition/lock/mapping.
- [ ] Không đổi lock order hoặc counter nếu chưa có concurrency/integration evidence.
- [ ] Error trả tiếng Việt qua error envelope V1.
- [ ] Schema thay đổi phải có forward migration, DBML/catalog/change-log/workbook cùng task.
- [ ] Contract thay đổi phải generate OpenAPI rồi regenerate Admin SDK; không sửa generated file.
- [ ] Cập nhật integration test cho replay, scope, stock commit và return condition.

## Revision history

| Version | Date | Change summary | Source |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-13 | Fulfillment persisted, transition API, stock commit/return và Admin workflow. | DBAPI-20260913-FULFILLMENT-S43 |
