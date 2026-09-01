# Business rules và state machine V1

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
5. Ship chỉ xảy ra sau payment success; ship trừ `on_hand` và `reserved` cùng transaction.
6. Ledger/history/audit là append-only. Sai nghiệp vụ được sửa bằng reversal/transition mới.
7. Backend kiểm tra permission + scope trên từng command/query; frontend không phải security boundary.
8. Maker không được duyệt yêu cầu do chính mình tạo.
9. Doanh thu chỉ ghi nhận khi order `COMPLETED`.
10. Mọi external event và command rủi ro có idempotency key/request ID.
11. Giá hiển thị và thanh toán đã gồm VAT; `tax_total` chỉ là phần VAT thông tin, không cộng vào tổng lần nữa.
12. Guest checkout vẫn tạo customer nội bộ `user_id=null`; không tự tạo tài khoản/mật khẩu.

## 2. Order

```text
PENDING_PAYMENT ──payment success──> CONFIRMED ──pick──> PROCESSING
       │                                  │                 │
       ├──customer/admin cancel──────────> CANCELLED         ├──delivered/close──> COMPLETED
       └──payment expiry─────────────────> CANCELLED         └──exception───────> PROCESSING
```

| From | To | Điều kiện | Side effect |
|---|---|---|---|
| create | PENDING_PAYMENT | Quote còn hạn; reserve toàn bộ | Tạo payment và outbox |
| PENDING_PAYMENT | CONFIRMED | Payment SUCCESS; reservation ACTIVE | Reservation COMMITTED; tạo fulfillment |
| PENDING_PAYMENT | CANCELLED | Chưa payment success | Release reservation/quota |
| CONFIRMED | PROCESSING | Fulfillment bắt đầu pick | Ghi history |
| PROCESSING | COMPLETED | Delivered và hết hold/được confirm | Ghi nhận revenue event |

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

## 4. Fulfillment

```text
PENDING -> PICKING -> PACKED -> SHIPPED -> DELIVERED
              │          │         └──> DELIVERY_FAILED -> RETURNING_TO_WAREHOUSE -> RETURNED_TO_WAREHOUSE
              └──────────┴──cancel chỉ qua order policy trước ship
```

- V1 một fulfillment/order. Không giao một phần.
- `SHIPPED` là điểm trừ tồn vật lý. Mọi item phải có committed reservation đủ số lượng.
- `DELIVERED` không trực tiếp thay order thành completed nếu còn hold window.
- Giao thất bại bắt buộc reason; hàng về đúng kho xuất. Chỉ hàng kiểm tra `RESTOCK` mới tăng lại sellable stock.

## 5. Inventory reservation

```text
ACTIVE -> COMMITTED -> RELEASED_AFTER_SHIP
   ├──> RELEASED
   └──> EXPIRED
```

- `ACTIVE` tăng `reserved`; `RELEASED/EXPIRED` giảm `reserved`.
- `COMMITTED` vẫn giữ `reserved`; khi ship giảm đồng thời `on_hand` và `reserved`, rồi reservation đóng.
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

1. Tính availability tại branch khách chọn.
2. Nếu thiếu bất kỳ item nào, tìm branch có đủ toàn bộ cart; không ghép nhiều branch.
3. Xếp hạng theo đủ hàng → ETA → phí ship → khoảng cách.
4. Khi khách chọn branch mới, server tạo quote mới và tính lại giá/ship/ETA.
5. Chỉ sau xác nhận mới reserve và tạo order. Không tự động đổi branch sau order creation.

## 10. Concurrency và error semantics

- `409 CONFLICT`: version cũ, trạng thái không hợp lệ, inventory/quota vừa thay đổi.
- `422 UNPROCESSABLE_ENTITY`: rule nghiệp vụ không đạt.
- `403 FORBIDDEN`: permission hoặc data scope không đạt; không dùng 404 để che nếu policy không yêu cầu.
- Retry chỉ an toàn cho command có idempotency key. Client dùng exponential backoff với network/5xx, không retry mù 4xx.
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
- Secret provider không xuất hiện trong frontend, audit log hoặc `system_settings`.
