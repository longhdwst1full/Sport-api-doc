# Business rules và state machine V1

> **Document version:** 1.8.0
>
> **Last updated:** 2026-09-13
>
> **Change summary:** Hiện thực Fulfillment transition, payment-expiry và auto-completion bằng secured cron worker.

## 0. Customer identity V1

- Public registration chỉ tạo `users.user_type=CUSTOMER`; staff vẫn do Admin tạo.
- Registration yêu cầu ít nhất normalized email hoặc normalized Vietnamese phone.
- Email được trim/lowercase. SĐT dạng `09…`, `+849…`, `849…`, `00849…` được validate bằng full numbering metadata và lưu E.164.
- V1 development tạo CUSTOMER `ACTIVE` ngay; `email_verified_at` và `phone_verified_at` để null. Phải bổ sung verification trước staging/production cho recovery và thao tác nhạy cảm.
- Login nhận một `identifier` email/phone và bắt buộc đúng `user_type`, tránh CUSTOMER đăng nhập qua Admin hoặc STAFF qua Storefront.
- Duplicate đồng thời dựa vào PostgreSQL unique index normalized email/phone và trả conflict.
- Tạo user, GUEST audit và initial session atomic; Argon2 hash và phone parsing chạy ngoài transaction.

## 1. Invariant không được phá

1. `available = on_hand - reserved >= 0`; không có đường code nào sửa tồn mà không tạo movement hoặc reservation transition.
2. Một order chỉ có một branch và warehouse; mọi reservation/fulfillment của order phải cùng warehouse.
3. Số tiền order/item là snapshot; catalog/price đổi sau đó không làm đổi đơn.
4. Payment success là idempotent và chỉ commit reservation một lần.
5. Payment success không trực tiếp sửa tồn. Ship/handover trừ `on_hand` và `reserved`, commit reservation trong cùng transaction; COD được ship khi payment còn pending và chỉ success sau khi xác nhận thu đủ tiền.
6. Ledger/history/audit là append-only. Sai nghiệp vụ được sửa bằng reversal/transition mới.
7. Backend kiểm tra permission + scope trên từng command/query; frontend không phải security boundary.
8. Maker không được duyệt yêu cầu do chính mình tạo.
9. Doanh thu chỉ ghi nhận khi order `COMPLETED`.
10. Mọi external event và command rủi ro có idempotency key/request ID.
11. Giá hiển thị và thanh toán đã gồm VAT; `tax_total` chỉ là phần VAT thông tin, không cộng vào tổng lần nữa.
12. Guest checkout vẫn tạo customer nội bộ `user_id=null`; không tự tạo tài khoản/mật khẩu.

### 1.1 Reservation expiry

- TTL mặc định 30 phút, cấu hình bằng `CHECKOUT_RESERVATION_TTL_MINUTES`.
- Worker quét mỗi 5 phút nên thời điểm release thực tế nằm trong khoảng ngay sau expiry đến tối đa khoảng 5 phút sau trong điều kiện scheduler bình thường.
- Chỉ reservation `ACTIVE` mới được expire. `COMMITTED`, `RELEASED`, `EXPIRED` là retry-safe và không bị trừ `reserved` lần hai.
- Hai worker đồng thời claim bằng `FOR UPDATE SKIP LOCKED`; balance được khóa theo warehouse/SKU ổn định để giảm deadlock.
- Giảm `reserved`, chuyển trạng thái reservation/checkout và ghi audit phải commit hoặc rollback cùng nhau.
- Job dùng internal Bearer secret, không dùng quyền người dùng và không xuất vào OpenAPI FE.

## 2. Order

```text
PENDING_CONFIRMATION -> CONFIRMED -> PICKING -> PACKED -> SHIPPED -> DELIVERED -> COMPLETED
        │
        └── customer/admin cancel trước payment/fulfillment ───────────────> CANCELLED
```

| From | To | Điều kiện | Side effect |
|---|---|---|---|
| create | PENDING_CONFIRMATION | Checkout CONFIRMED; reservation ACTIVE | Tạo Order snapshot; Payment được tạo ở S4.2 |
| PENDING_CONFIRMATION | CANCELLED | Payment PENDING; Fulfillment PENDING | Release reservation atomically; history + audit |
| PENDING_CONFIRMATION | CONFIRMED | Payment/ops policy hợp lệ | Tạo fulfillment và ghi history |
| CONFIRMED | PICKING | Kho bắt đầu pick | Ghi fulfillment/order history |
| PICKING | PACKED | Đủ toàn bộ item/component | Ghi history |
| PACKED | SHIPPED | Payment precondition đúng | Commit reservation và trừ kho atomically |
| SHIPPED | DELIVERED | Carrier/nhân viên xác nhận giao | Bắt đầu hold 72 giờ |
| DELIVERED | COMPLETED | Hết 72 giờ không khiếu nại, hoặc Admin manual complete bất kỳ lúc nào khi Payment SUCCESS | Ghi nhận revenue event; reason/audit nếu complete tay |

Không có transition quay lại. Sửa sai bằng command riêng và history. `CANCELLED`/`COMPLETED` là terminal trong V1.

## 3. Payment

```text
PENDING -> AWAITING_CONFIRMATION -> SUCCESS
   │              ├──────────────> FAILED
   ├──────────────> EXPIRED
   └ late/ambiguous event ───────> NEED_REVIEW
SUCCESS -> REFUND_PENDING -> REFUNDED
```

- `received_amount` phải bằng `expected_amount` trong V1. Thiếu/thừa tiền → `NEED_REVIEW`.
- Payment đến sau order/reservation expiry → `NEED_REVIEW`; nhân viên quyết định tạo lại đơn/reservation hoặc refund thủ công.
- File evidence chỉ là bằng chứng, không phải sự thật payment.
- Provider webhook nếu có phải verify signature, lưu payload đã redaction và deduplicate external event ID.
- `BANK_TRANSFER`: khách thanh toán đủ một lần trước khi xử lý giao; thiếu/thừa tiền vào `NEED_REVIEW`.
- `COD`: payment giữ `PENDING/AWAITING_COLLECTION` khi tạo đơn và trong quá trình giao; chỉ carrier callback hoặc nhân viên có quyền xác nhận thu đủ mới chuyển `SUCCESS`.
- COD phải lưu method, số tiền cần thu/thực thu, carrier/reference, thời điểm thu và note/reason. Doanh thu chỉ ghi nhận khi Order `COMPLETED`, không ghi nhận khi vừa tạo COD.
- Mỗi review gửi `expectedVersion` và `Idempotency-Key`; cùng key/payload replay kết quả, cùng key khác payload trả conflict.
- `payment_transactions` append-only. Payment và `orders.payment_status` phải đổi cùng transaction hoặc cùng rollback.
- `PAYMENT_TIMEOUT_MINUTES` mặc định 30 phút; evidence hợp lệ đã nộp chuyển `AWAITING_CONFIRMATION` và không được worker tự expire.
- Worker payment expiry claim theo `FOR UPDATE SKIP LOCKED`; trong cùng transaction release `reserved`, cancel reservation/payment/order/fulfillment và ghi ledger/audit. Số `claimed` và `expired` được báo riêng để nhận biết race có evidence.

## 4. Fulfillment

```text
PENDING -> PICKING -> PACKED -> SHIPPED -> DELIVERED
              │          │         └──> DELIVERY_FAILED -> RETURNING_TO_WAREHOUSE -> RETURNED_TO_WAREHOUSE
              └──────────┴──cancel chỉ qua order policy trước ship
```

- V1 một fulfillment/order. Không giao một phần.
- `SHIPPED` là điểm trừ tồn vật lý. Mọi item phải có committed reservation đủ số lượng.
- `DELIVERED` không trực tiếp thay order thành completed nếu còn hold window.
- Giao thất bại bắt buộc reason; hàng về đúng kho xuất. Chỉ condition `SELLABLE` mới tăng lại sellable stock; `DAMAGED/MISSING` không cộng tồn bán.
- Worker completion chỉ claim Order `DELIVERED + Payment SUCCESS + Fulfillment DELIVERED` quá `ORDER_COMPLETION_HOLD_HOURS`; Admin manual complete vẫn cần reason/audit và không phải chờ hold.

## 5. Inventory reservation

```text
ACTIVE -> COMMITTED -> RELEASED_AFTER_SHIP
   ├──> RELEASED
   └──> EXPIRED
```

- `ACTIVE` tăng `reserved`; `RELEASED/EXPIRED` giảm `reserved`.
- `ACTIVE` được giữ qua payment success; khi ship/handover giảm đồng thời `on_hand` và `reserved`, sau đó chuyển reservation `COMMITTED`.
- Job expiry dùng conditional update `WHERE status='ACTIVE' AND expires_at<=now()`; chạy lặp không double release.
- Lock/conditional update theo thứ tự `(warehouse_id, variant_id)` để giảm deadlock.

## 6. Flash sale

```text
Campaign: DRAFT -> SCHEDULED -> ACTIVE -> ENDED
                         │       └──> PAUSED -> ACTIVE | ENDED
                         └──> CANCELLED
Quota reservation: ACTIVE -> COMMITTED | RELEASED | EXPIRED
```

- Giá sale chỉ hợp lệ khi campaign active, item active, quota còn và customer chưa vượt limit.
- Inventory reservation và quota reservation phải cùng thành công hoặc cùng rollback.
- Không hỗ trợ voucher stacking hoặc quota theo branch trong V1.

## 7. Return/refund

```text
REQUESTED -> UNDER_REVIEW -> APPROVED -> RECEIVED -> REFUND_PENDING -> REFUNDED -> CLOSED
                   └────────> REJECTED
APPROVED/RECEIVED ──────────> CANCELLED (theo policy)
```

- V1 cho chọn order item và quantity cần trả. Combo phải trả nguyên combo, không trả riêng component.
- Policy được version hóa; request giữ FK tới version được áp dụng.
- Khi nhận hàng: `RESTOCK` tạo movement IN; `DAMAGED` không tăng sellable stock; `REJECTED` không hoàn tiền.
- Quyết định trả hàng và approve refund là hai quyền khác nhau.
- Refund có thể nhỏ hơn payment dù khách chỉ thanh toán một lần; tổng refund SUCCESS không được vượt received amount.

## 8. Approval

```text
DRAFT -> SUBMITTED -> APPROVED -> EXECUTING -> EXECUTED
                    ├──> REJECTED
                    └──> EXPIRED
EXECUTING -> EXECUTION_FAILED (được retry cùng idempotency key)
```

Áp dụng cho:

- Refund toàn phần.
- Stock adjustment vượt ngưỡng cấu hình hoặc làm tồn giảm mạnh.
- Giá thay đổi quá ngưỡng phần trăm/giá trị hoặc retroactive.
- Gán role chứa permission nhạy cảm.

Không áp dụng mặc định cho sửa tên sản phẩm, nội dung CMS hay thao tác vận hành thông thường.

## 9. Quy tắc branch fallback

1. Online V1 không nhận `branch_id` từ khách; backend chỉ xét branch ACTIVE có warehouse ACTIVE và đủ toàn bộ cart, không ghép nhiều branch.
2. Khi có tọa độ hợp lệ, chọn branch đủ hàng gần nhất. Trong bán kính cấu hình mặc định 10 km dùng `BRANCH_FREE`, phí 0.
3. Khi carrier chưa có key, ngoài 10 km dùng `STANDARD_DELIVERY`: đến 5 kg = 50.000đ; trên 5–20 kg = 100.000đ; trên 20 kg = 200.000đ. Ngưỡng và phí đọc từ validated env, không hard-code tại FE.
4. GHN/GHTK mặc định tắt và chỉ được bật khi có key/shop/pickup mapping thật. Hàng đặc thù hoặc giao xe khách chuyển `AWAITING_SHIPPING_CONSULTATION`; Admin chỉ thấy quote thuộc branch scope, dùng `version` hiện tại để ghi phí/ETA/provider/note đã đồng ý. Client phải đọc lại quote thuộc đúng cart và chỉ được confirm sau khi trạng thái trở lại `QUOTED`.
5. Khi thiếu tọa độ, ưu tiên branch đủ hàng có quote tự động tốt nhất theo phí rồi ETA; branch selection thủ công vẫn tắt trong V1.
6. Chỉ sau xác nhận quote mới reserve. Không tự động đổi branch sau khi reservation/order đã tạo.

## 10. Concurrency và error semantics

- `409 CONFLICT`: version cũ, trạng thái không hợp lệ, inventory/quota vừa thay đổi.
- `422 UNPROCESSABLE_ENTITY`: rule nghiệp vụ không đạt.
- `403 FORBIDDEN`: permission hoặc data scope không đạt; không dùng 404 để che nếu policy không yêu cầu.
- Retry chỉ an toàn cho command có idempotency key. Client dùng exponential backoff với network/5xx, không retry mù 4xx.
- Request hash của Order transition tối thiểu gồm action, Order ID, `expectedVersion` và payload nghiệp vụ đã normalize; cùng key nhưng khác một trường phải trả `409`.
- Test concurrency tối thiểu 20–100 request tranh cùng SKU/quota và chứng minh không oversell.

## 10A. Combo cố định

- Combo là một sellable variant có giá riêng nhưng không có tồn riêng.
- Availability = giá trị nhỏ nhất của `component available / component quantity`.
- Checkout reserve từng component; thiếu một component thì rollback toàn combo.
- Không cho combo chứa combo và không cho khách thay thành phần trong V1.
- Order snapshot thành phần qua `order_item_components`; ship trừ tồn component.
- Return bắt buộc nguyên combo và đủ component theo snapshot.

## 11. Review, comment và CMS

```text
Review: PENDING -> PUBLISHED | REJECTED
PUBLISHED -> HIDDEN -> PUBLISHED | ARCHIVED

Page/Post: DRAFT -> SCHEDULED -> PUBLISHED -> ARCHIVED
                  └────────────> CANCELLED
```

- Review chỉ tạo từ order item đã delivered; một review/order item.
- Media review chỉ public sau khi upload finalize và moderation/scan đạt.
- Comment review V1 tối đa một cấp; rating chỉ nằm ở review gốc.
- Staff reply phải hiện nhãn đại diện cửa hàng và ghi audit actor.
- Page dùng cho giới thiệu/liên hệ/chính sách/hướng dẫn; Post dùng cho news/tip/guide/review article.
- Bài viết có category/tag riêng và quan hệ n-n với product.

## 12. External media lifecycle

```text
UPLOADING -> ACTIVE -> DELETING -> DELETED
              ├────> QUARANTINED
              └────> FAILED
```

- Client upload trực tiếp bằng signed preset/token ngắn hạn; backend không proxy file lớn.
- Finalize phải xác minh provider asset ID, folder, MIME, size và chữ ký/webhook.
- Asset đang được product/review/page/post/banner sử dụng không được xóa vật lý.
- Job cleanup chạy idempotent; provider callback bị gửi lặp không tạo asset trùng.
- Secret provider không xuất hiện trong frontend hoặc audit log; chỉ cấu hình qua environment/secret manager phía backend.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.8.0 | 2026-09-13 | Hiện thực Fulfillment, hàng hoàn SELLABLE và maintenance worker payment-expiry/auto-complete. | DBAPI-20260913-FULFILLMENT-S43 |
| 1.7.1 | 2026-09-12 | Chốt manual complete không giới hạn trong ngày sau khi giao đủ và thu đủ tiền. | API-20260912-ORDER-GUEST-HARDENING |
| 1.7.0 | 2026-09-12 | Đồng bộ state, exact amount, COD delivery gate và idempotent review của Payment V1. | DBAPI-20260912-PAYMENT-S42 |
| 1.6.1 | 2026-09-11 | Khóa semantics request hash Order transition theo action/ID/version/payload. | API-20260911-ORDER-S41-HARDENING |
| 1.6.0 | 2026-09-11 | Đồng bộ Order state thật; cancel release atomic; auto-complete 72 giờ và Admin complete sớm có điều kiện. | API-20260911-ORDER-OWN-TRANSITIONS / D05 |
| 1.5.0 | 2026-09-08 | Thêm invariant và vận hành expiry reservation bằng Supabase Cron. | API-20260908-RESERVATION-EXPIRY-WORKER |
| 1.4.0 | 2026-09-08 | Chốt vòng tư vấn giao hàng có scoped Admin list, optimistic version và Client reload quote. | API-20260908-CHECKOUT-CONSULTATION-ROUNDTRIP |
| 1.3.0 | 2026-09-08 | Thêm STANDARD_DELIVERY với ba mức phí env; carrier mặc định tắt đến khi có credential thật. | DBAPI-20260908-DEFAULT-SHIPPING-RATES |
| 1.2.0 | 2026-09-08 | Chốt COD, branch auto-selection, miễn phí 10 km, GHN/GHTK và manual external consultation. | D34 / DBAPI-20260908-CHECKOUT-SHIPPING-COD |
| 1.1.0 | 2026-09-08 | Chốt payment không sửa tồn; ship/handover commit reservation và giảm on_hand+reserved. | D01 / DB-20260908-INVENTORY-HANDOVER |
| 1.0.0 | 2026-09-08 | Ghi nhận parameter vận hành và secret chỉ dùng backend environment/secret manager. | D45 / DB-20260908-CONFIG-ENV |
