# Sprint 3 — Customer, Cart, Checkout, Reservation & Shipping Quote

> **Document version:** 2.0.0
>
> **Last updated:** 2026-09-08
>
> **Change summary:** Chốt thời điểm trừ tồn tại lúc tạo Order thành công, TTL 30 phút đọc từ `system_settings`, cấu trúc reservation header/items và schema foundation Sprint 3.

## 1. Mục tiêu và giới hạn

Milestone `M3 — Checkout Safe` đạt khi guest hoặc customer đăng nhập có thể:

1. duy trì cart trên server;
2. nhập thông tin nhận hàng;
3. resolve đúng branch/warehouse theo rule `1 branch = 1 warehouse`;
4. nhận quote đã revalidate giá, tồn, phí giao và ETA;
5. xác nhận quote để reserve đủ toàn bộ SKU/component combo;
6. release reservation khi hết TTL hoặc hủy checkout.

Sprint 3 chưa tạo Order/Payment/Fulfillment. Cart không giữ tồn. Checkout không được tin giá, tổng tiền, branch hoặc tồn do frontend gửi lên.

## 2. Đánh giá bảng trước khi migrate

| Nhóm | Bảng đã có vật lý | Bảng cần cho Sprint 3 | Lý do không gộp |
| --- | --- | --- | --- |
| Customer | Chưa có | `customers`, `customer_addresses` | Customer hỗ trợ guest và account; address book có lifecycle riêng, còn checkout giữ snapshot riêng. |
| Cart | Chưa có | `carts`, `cart_items` | Cart là dữ liệu có thể thay đổi và không phải cam kết giá/tồn. |
| Checkout | Chưa có | `checkout_sessions`, `checkout_session_items` | Quote cần snapshot/version/expiry riêng để thay đổi cart không làm sai nội dung đã confirm. |
| Reservation | `inventory_balances.reserved` mới chỉ có counter | `inventory_reservations`, `inventory_reservation_items` | Header quản lý token/idempotency/TTL/status một lần; item biểu diễn nhu cầu vật lý đã gộp theo SKU, kể cả component combo. |
| Shipping quote | Chưa có | `shipping_zones`, `shipping_rates` | V1 giữ danh sách mã tỉnh trong zone để không thêm bảng mapping chưa cần thiết; snapshot fee/ETA nằm trong checkout session. |
| Platform config | Chưa có | `system_settings` | Tham số nghiệp vụ có kiểu, version và audit actor; không hard-code TTL và tuyệt đối không lưu secret. |

Sprint 3 thêm 10 bảng nghiệp vụ và 1 bảng cấu hình dùng chung. Đây không phải tạo toàn bộ model 74 bảng; mỗi migration chỉ chứa bảng mà use case Sprint 3 thực sự đọc/ghi. T62 `system_settings` được kéo từ P1 lên foundation vì đã có nhu cầu thật là TTL reservation.

### Vì sao không giữ một bảng `inventory_reservations` phẳng như DBML cũ

Một checkout có nhiều SKU và combo. Nếu token/status/expiry lặp ở mỗi dòng, một lần expire có thể để lại trạng thái nửa release; đồng thời cùng SKU có thể xuất hiện trực tiếp và qua nhiều combo. Header + items cho phép:

- khóa một aggregate rồi transition `ACTIVE → COMMITTED/RELEASED/EXPIRED` nguyên tử;
- hash request một lần để retry không tạo reservation trùng;
- gộp demand vật lý theo `warehouse_id + product_variant_id` và lưu breakdown nguồn khi cần trace;
- Sprint 4 liên kết một reservation header với Order mà không sửa từng dòng.

Không thêm bảng event riêng cho reservation trong V1. Lifecycle row + AuditLog là đủ; `inventory_movements` chỉ ghi biến động vật lý và không ghi RESERVE/RELEASE delta 0.

## 3. Invariant dự kiến

- `available = on_hand - reserved`; không cho `reserved > on_hand`.
- Toàn bộ demand của một checkout dùng đúng warehouse của branch đã resolve.
- Reserve tất cả hoặc rollback tất cả; balance được khóa theo thứ tự `warehouse_id, product_variant_id` ổn định.
- Combo không reserve SKU combo ảo; reserve component SKU sau khi gộp quantity.
- `reservation_token` và idempotency key unique; cùng key khác request hash trả conflict.
- Chỉ `ACTIVE` mới được release/expire/commit; retry cùng command trả cùng kết quả.
- Khi Sprint 4 tạo Order thành công: trong cùng transaction, `on_hand -= quantity`, `reserved -= quantity`, reservation thành `COMMITTED` và ghi movement. `SHIPPED` chỉ đổi trạng thái fulfillment.
- Hủy sau khi Order đã commit không release reservation; phải tạo movement hoàn kho bù trừ có reason. Hàng giao thất bại chỉ restock sau khi thực nhận/inspection.
- Worker expiry lấy batch bằng `FOR UPDATE SKIP LOCKED`; không dùng `setInterval` trong Vercel function.
- Guest cart dùng anonymous token dạng hash; không lưu raw bearer token có thể dùng để chiếm cart.
- Quote hết hạn hoặc price/stock/shipping thay đổi phải quote lại và customer xác nhận lại.

## 4. Function matrix dự kiến

| ID | Function | API boundary | Điều kiện Done |
| --- | --- | --- | --- |
| CUS-01 | Upsert guest/customer checkout profile | Storefront v1 | Normalize email/phone; guest tạo customer không password; account được link an toàn. |
| CART-01 | Get/create cart | Storefront v1 | Một ACTIVE cart/owner; guest token không lộ raw value trong DB/log. |
| CART-02 | Add/update/remove item | Storefront v1 | Server validate sellability; optimistic version; quantity > 0; không reserve. |
| CHK-01 | Create/requote checkout session | Storefront v1 | Revalidate product/variant/price/combo/stock; resolve branch/warehouse; snapshot shipping fee/ETA. |
| RSV-01 | Confirm reservation | Storefront v1 | Atomic all-or-nothing; idempotent; no oversell; combo component demand đúng. |
| RSV-02 | Release/expire reservation | Internal + Storefront v1 | Atomic decrement reserved; retry-safe; reason/audit; batch worker safe. |
| SHP-Q01 | Quote shipping | Storefront v1 | Chỉ đọc active rate; deterministic; fee/ETA snapshot và re-confirm khi thay đổi. |

## 5. Decision gate bắt buộc trước migration

### D01 — Thời điểm trừ tồn vật lý — DECIDED

Owner chốt: checkout confirm chỉ tăng `reserved`; khi backend tạo Order thành công thì giảm đồng thời `on_hand` và `reserved`, chuyển reservation sang `COMMITTED` và ghi movement trong **cùng một database transaction**. `SHIPPED` không thay đổi tồn lần nữa.

Ví dụ `on_hand=10`: checkout 2 sản phẩm → `reserved=2`, `available=8`; tạo Order thành công → `on_hand=8`, `reserved=0`, `available=8`; ship → vẫn `8/0/8`.

Rủi ro và kiểm soát:

- đơn chưa trả tiền hoặc bị hủy đã làm giảm tồn vật lý trên hệ thống: bắt buộc command hủy tạo movement hoàn kho bù trừ, không sửa counter trực tiếp;
- retry request có thể trừ hai lần: Order command và movement dùng idempotency key unique;
- tạo Order thành công nhưng commit kho lỗi hoặc ngược lại: hai thao tác phải nằm trong cùng transaction và lock balance theo thứ tự ổn định;
- số hệ thống đã giảm trước khi nhân viên lấy hàng khỏi kệ: dashboard cần phân biệt tồn sổ sách với trạng thái fulfillment; kiểm kê xử lý chênh lệch bằng adjustment;
- hủy sau commit khác expire trước commit: trước commit giảm `reserved`; sau commit tăng lại `on_hand` bằng movement bù trừ.

### D02 — TTL — DECIDED

Reservation checkout giữ 30 phút tính từ lúc confirm quote. Hết hạn thì worker chuyển `ACTIVE → EXPIRED` và trả `reserved`; cart vẫn còn để khách quote lại. Giá trị đọc từ setting private `checkout.reservation_ttl_minutes`, kiểu `INTEGER`, giới hạn 5–1440 phút; setting thiếu/sai kiểu thì fail closed, không âm thầm dùng giá trị khác.

### S3-D03 — Cấu trúc reservation — DECIDED

Đề xuất: dùng header `inventory_reservations` + child `inventory_reservation_items`, thay mô hình một bảng phẳng trong DBML. Không thêm event table trong V1.

Ba quyết định đã được OWNER xác nhận ngày 2026-09-08. Schema, migration, tài liệu canonical và workbook phải cùng mang change ID `DB-20260908-SPRINT3-CHECKOUT` trước khi handoff.

## 6. Thứ tự triển khai

1. Chốt D01/D02/S3-D03 và cập nhật canonical model. **Done**
2. Migration customer/cart/shipping master; repository + API + unit/integration.
3. Migration checkout/reservation; transaction/locking/idempotency + concurrency test trên database QA riêng.
4. Storefront regenerate SDK; cart/checkout loading-empty-error-expired/requote states.
5. Expiry endpoint/worker có secret; audit và observability.
6. Full API/Client gate, OpenAPI drift check, BA/QA evidence.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 2.0.0 | 2026-09-08 | Chốt trừ tồn tại Order success; TTL 30 phút qua typed setting; header/items; thêm 11 bảng vật lý foundation. | D01 / D02 / S3-D03 / DB-20260908-SPRINT3-CHECKOUT |
| 1.0.0 | 2026-09-07 | Tạo baseline, bảng đề xuất, invariant, function matrix và decision gate Sprint 3. | Master Plan M3 / D01 / D02 / S3-D03 |
