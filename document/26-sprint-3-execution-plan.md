# Sprint 3 — Customer, Cart, Checkout, Reservation & Shipping Quote

> **Document version:** 3.0.0
>
> **Last updated:** 2026-09-08
>
> **Change summary:** Mở rộng Sprint 3 với branch auto-selection, miễn phí 10 km, GHN/GHTK fallback, tư vấn giao thủ công và snapshot BANK_TRANSFER/COD.

## 1. Mục tiêu và giới hạn

Milestone `M3 — Checkout Safe` đạt khi guest hoặc customer đăng nhập có thể:

1. duy trì cart trên server;
2. nhập thông tin nhận hàng;
3. resolve đúng branch/warehouse theo rule `1 branch = 1 warehouse`;
4. nhận quote đã revalidate giá, tồn, phí giao và ETA;
5. xác nhận quote để reserve đủ toàn bộ SKU/component combo;
6. release reservation khi hết TTL hoặc hủy checkout.

Sprint 3 chưa tạo Order/Payment/Fulfillment vật lý. Checkout snapshot phương thức `BANK_TRANSFER` hoặc `COD` để Sprint 4 tạo Payment đúng loại. Cart không giữ tồn. Checkout không được tin giá, tổng tiền, branch hoặc tồn do frontend gửi lên.

## 2. Đánh giá bảng trước khi migrate

| Nhóm | Bảng đã có vật lý | Bảng cần cho Sprint 3 | Lý do không gộp |
| --- | --- | --- | --- |
| Customer | Chưa có | `customers`, `customer_addresses` | Customer hỗ trợ guest và account; address book có lifecycle riêng, còn checkout giữ snapshot riêng. |
| Cart | Chưa có | `carts`, `cart_items` | Cart là dữ liệu có thể thay đổi và không phải cam kết giá/tồn. |
| Checkout | Chưa có | `checkout_sessions`, `checkout_session_items` | Quote cần snapshot/version/expiry riêng để thay đổi cart không làm sai nội dung đã confirm. |
| Reservation | `inventory_balances.reserved` mới chỉ có counter | `inventory_reservations`, `inventory_reservation_items` | Header quản lý token/idempotency/TTL/status một lần; item biểu diễn nhu cầu vật lý đã gộp theo SKU, kể cả component combo. |
| Shipping quote | Chưa có | `shipping_zones`, `shipping_rates` | V1 giữ danh sách mã tỉnh trong zone để không thêm bảng mapping chưa cần thiết; snapshot fee/ETA nằm trong checkout session. |

Sprint 3 thêm đúng 10 bảng nghiệp vụ. TTL là cấu hình deployment nên dùng `CHECKOUT_RESERVATION_TTL_MINUTES` trong environment, được validate khi khởi động và không tạo thêm database query trong checkout.

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
- Order được chấp nhận hoặc payment thành công vẫn giữ reservation `ACTIVE`; không giảm `on_hand` khi hàng còn trong kho.
- Khi fulfillment chuyển `SHIPPED/HANDED_OVER`: trong cùng transaction, `on_hand -= quantity`, `reserved -= quantity`, reservation thành `COMMITTED` và ghi movement `SALE_SHIP`.
- Hủy trước bàn giao release `reserved`; sau bàn giao phải đi qua return/failed-delivery. Hàng chỉ restock sau khi warehouse thực nhận và inspection.
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
| SHP-Q02 | Carrier quote orchestration | Storefront v1 | Miễn phí trong 10 km; ngoài phạm vi gọi provider có timeout; không có quote thì chuyển consultation. |
| SHP-M01 | Manual external agreement | Admin v1 | Branch scope; lưu fee/ETA/provider/note/actor; reset quote expiry; customer phải confirm lại. |
| PAY-S01 | Select payment method | Storefront v1 | Chỉ BANK_TRANSFER hoặc COD; snapshot vào checkout; không đánh dấu đã thu tiền. |

## 5. Decision gate bắt buộc trước migration

### D01 — Thời điểm trừ tồn vật lý — DECIDED

Owner chốt: checkout/Order accepted chỉ tăng hoặc tiếp tục giữ `reserved`. Payment success xác nhận tiền nhưng không giảm `on_hand` nếu hàng còn trong kho. Khi kho/cửa hàng thực sự bàn giao hàng tại `SHIPPED/HANDED_OVER`, backend giảm đồng thời `on_hand` và `reserved`, chuyển reservation sang `COMMITTED` và ghi movement trong **cùng một database transaction**.

Ví dụ `on_hand=10`: checkout 2 sản phẩm → `reserved=2`, `available=8`; payment success → vẫn `10/2/8`; bàn giao cho carrier/khách → `on_hand=8`, `reserved=0`, `available=8`.

Rủi ro và kiểm soát:

- retry ship có thể trừ hai lần: fulfillment transition và movement dùng idempotency key unique;
- fulfillment SHIPPED nhưng commit kho lỗi hoặc ngược lại: transition, balance, reservation, movement và history phải cùng transaction;
- payment success nhưng hủy trước ship: refund payment và release `reserved`, không tạo movement vì hàng chưa rời kho;
- COD ship khi payment còn pending: vẫn commit tồn tại SHIPPED; giao thất bại chỉ restock sau khi hàng thực tế quay về kho;
- trạng thái sàn giữ/giải ngân tiền thuộc Payment/Settlement và không thay đổi quy tắc vật lý của `on_hand`.

### D02 — TTL — DECIDED

Reservation checkout giữ 30 phút tính từ lúc confirm quote. Hết hạn thì worker chuyển `ACTIVE → EXPIRED` và trả `reserved`; cart vẫn còn để khách quote lại. Giá trị đọc từ env `CHECKOUT_RESERVATION_TTL_MINUTES`, kiểu integer, giới hạn 5–1440 phút; app fail-fast khi cấu hình sai. `.env.local`, `.env.example`, `.env.local.example` và `.env.production` cùng khai báo giá trị mặc định 30.

### S3-D03 — Cấu trúc reservation — DECIDED

Đề xuất: dùng header `inventory_reservations` + child `inventory_reservation_items`, thay mô hình một bảng phẳng trong DBML. Không thêm event table trong V1.

Ba quyết định đã được OWNER xác nhận ngày 2026-09-08. Schema, migration, tài liệu canonical và workbook phải cùng mang change ID `DB-20260908-SPRINT3-CHECKOUT` trước khi handoff.

### D34 — COD và vận chuyển — DECIDED

- Online tự chọn đúng một branch/warehouse đủ toàn bộ cart; khách chọn branch vẫn tắt.
- Có tọa độ thì branch gần nhất thắng; trong 10 km miễn phí. Không có tọa độ thì xếp quote khả dụng theo phí và ETA.
- Ngoài 10 km ưu tiên carrier adapter GHN/GHTK. Timeout/lỗi provider không làm crash checkout; hệ thống dùng bảng phí nội bộ hoặc chuyển tư vấn thủ công.
- Manual external/xe khách bắt buộc nhân viên lưu phí, ETA, provider và nội dung khách đã đồng ý; checkout chỉ `QUOTED` lại sau thao tác này.
- `BANK_TRANSFER` trả đủ một lần trước giao. `COD` được ship khi payment chưa SUCCESS; carrier/nhân viên xác nhận thu đủ mới SUCCESS. Báo cáo doanh thu chỉ nhận khi Order COMPLETED.

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
| 3.0.0 | 2026-09-08 | Thêm branch auto-selection, free 10 km, carrier/fallback/manual shipping và BANK_TRANSFER/COD snapshot. | D34 / DBAPI-20260908-CHECKOUT-SHIPPING-COD |
| 2.2.0 | 2026-09-08 | Chốt on_hand giảm tại SHIPPED/HANDED_OVER; payment/reservation/fulfillment độc lập. | D01 / DB-20260908-INVENTORY-HANDOVER |
| 2.1.0 | 2026-09-08 | Chuyển TTL sang validated environment; tạo migration bù xóa system_settings; foundation còn 10 bảng. | D02 / D45 / DB-20260908-CONFIG-ENV |
| 2.0.0 | 2026-09-08 | Chốt trừ tồn tại Order success; TTL 30 phút qua typed setting; header/items; thêm 11 bảng vật lý foundation. | D01 / D02 / S3-D03 / DB-20260908-SPRINT3-CHECKOUT |
| 1.0.0 | 2026-09-07 | Tạo baseline, bảng đề xuất, invariant, function matrix và decision gate Sprint 3. | Master Plan M3 / D01 / D02 / S3-D03 |
