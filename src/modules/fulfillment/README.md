# Fulfillment module — maintenance note

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-17
>
> **Change summary:** Nối hãng vận chuyển GHN: tạo/huỷ vận đơn, webhook đồng bộ trạng thái và in phiếu giao.

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

## Tích hợp hãng vận chuyển

- Cổng là `ShippingPartnerClient`; adapter GHN nằm ở `integrations/shipping-partner`. Thiếu token/shop id thì rơi về `DisabledShippingPartnerClient` và mã vận đơn nhập tay như trước.
- **Vận đơn tạo NGOÀI transaction.** Gọi HTTP bên trong sẽ giữ khoá tồn kho suốt vòng mạng, và mỗi lần serializable retry sẽ tạo thêm một vận đơn trùng ở hãng. Transaction hỏng sau đó thì `cancelPartnerShipment` huỷ bù, nếu không shipper vẫn tới lấy kiện hàng mà hệ thống coi như chưa xuất kho.
- Admin nhập `trackingNo` tay thì không gọi hãng; lệnh replay (đã có `idempotencyKey` trong history) cũng không tạo vận đơn lần hai.
- **Điểm lấy hàng là địa chỉ chi nhánh sở hữu kho xuất**, đọc từ `branches.address_json` (`districtCode`/`wardCode`), không phải biến môi trường. Chi nhánh thiếu mã địa giới thì chặn ship kèm lỗi tiếng Việt.
- COD gửi `cod_amount` bằng tổng đơn; đơn đã thanh toán trước gửi 0 — sai chỗ này là thu tiền khách hai lần.
- Webhook `POST /api/v1/integrations/ghn/webhook` ánh xạ `delivered` → `deliver`, `delivery_fail` → `failDelivery`; trạng thái khác bỏ qua. Khoá idempotency dựng từ mã vận đơn + trạng thái nên GHN gửi lại không chuyển trạng thái hai lần.
- Secret webhook nhận qua query string vì cổng GHN chỉ lưu được URL, không thêm được header; đổi lại secret nằm trong access log nên phải xoay được độc lập.
- Transition do webhook kích hoạt đứng tên tài khoản dịch vụ `GHN_WEBHOOK_ACTOR_USER_ID` vì `audit_logs` khoá ngoại tới `users`; không cấu hình thì webhook từ chối thay vì bịa actor.
- URL in phiếu giao do hãng phát hành và sống rất ngắn: không lưu DB, không đưa vào audit.

## Checklist khi sửa

- [ ] Impact analysis trước khi sửa transition/lock/mapping.
- [ ] Không đổi lock order hoặc counter nếu chưa có concurrency/integration evidence.
- [ ] Error trả tiếng Việt qua error envelope V1.
- [ ] Schema thay đổi phải có forward migration, DBML/catalog/change-log/workbook cùng task.
- [ ] Contract thay đổi phải generate OpenAPI rồi regenerate Admin SDK; không sửa generated file.
- [ ] Cập nhật integration test cho replay, scope, stock commit và return condition.
- [ ] Không gọi hãng vận chuyển bên trong transaction, và mọi đường tạo vận đơn phải có đường huỷ bù.

## Revision history

| Version | Date | Change summary | Source |
| --- | --- | --- | --- |
| 1.1.0 | 2026-09-17 | Tạo/huỷ vận đơn GHN ngoài transaction kèm huỷ bù, webhook đồng bộ trạng thái và in phiếu giao. | API-20260916-GHN-SHIPPING |
| 1.0.0 | 2026-09-13 | Fulfillment persisted, transition API, stock commit/return và Admin workflow. | DBAPI-20260913-FULFILLMENT-S43 |
