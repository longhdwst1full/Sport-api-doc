# Sprint 3 — Customer, Cart, Checkout, Reservation & Shipping Quote

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-07
>
> **Change summary:** Tạo baseline Sprint 3 từ Master Plan, rà soát bảng mới theo aggregate và đặt decision gate trước migration.

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
| Shipping quote | Chưa có | `shipping_zones`, `shipping_rates` | Rule vận chuyển là master data; snapshot fee/ETA nằm trong checkout session, không đọc lại rate sau confirm. |

Đề xuất Sprint 3 thêm 10 bảng, theo bốn aggregate rõ ràng. Đây không phải tạo toàn bộ model 74 bảng; mỗi migration chỉ chứa bảng mà use case Sprint 3 thực sự đọc/ghi.

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

### D01 — Thời điểm trừ tồn vật lý

Đề xuất: checkout chỉ tăng `reserved`; payment success đổi reservation sang `COMMITTED` nhưng chưa giảm `on_hand`; lúc `SHIPPED` mới giảm đồng thời `on_hand` và `reserved` và ghi movement `SALE_SHIP`.

Ví dụ `on_hand=10`: checkout 2 sản phẩm → `reserved=2`, `available=8`; payment success vẫn `10/2/8`; ship → `on_hand=8`, `reserved=0`, `available=8`.

### D02 — TTL

Đề xuất: reservation checkout giữ 30 phút tính từ lúc confirm quote. Hết hạn thì worker chuyển `ACTIVE → EXPIRED` và trả `reserved`; cart vẫn còn để khách quote lại.

### S3-D03 — Cấu trúc reservation

Đề xuất: dùng header `inventory_reservations` + child `inventory_reservation_items`, thay mô hình một bảng phẳng trong DBML. Không thêm event table trong V1.

Ba quyết định trên phải được OWNER xác nhận trước khi sửa DBML/Prisma/migration. Sau xác nhận, mọi bảng/cột/index sẽ được trace vào `11-model-change-log.json` và workbook review trước khi handoff.

## 6. Thứ tự triển khai

1. Chốt D01/D02/S3-D03 và cập nhật canonical model.
2. Migration customer/cart/shipping master; repository + API + unit/integration.
3. Migration checkout/reservation; transaction/locking/idempotency + concurrency test trên database QA riêng.
4. Storefront regenerate SDK; cart/checkout loading-empty-error-expired/requote states.
5. Expiry endpoint/worker có secret; audit và observability.
6. Full API/Client gate, OpenAPI drift check, BA/QA evidence.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-07 | Tạo baseline, bảng đề xuất, invariant, function matrix và decision gate Sprint 3. | Master Plan M3 / D01 / D02 / S3-D03 |
