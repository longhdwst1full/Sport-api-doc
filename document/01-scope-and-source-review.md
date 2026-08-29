# Phạm vi và đánh giá source tham chiếu

## 1. Phạm vi V1 đã tái cấu trúc

### Kênh khách hàng

- Web responsive và PWA: duyệt danh mục, tìm kiếm/lọc, xem tồn khả dụng theo chi nhánh, giỏ hàng guest/account, checkout, chuyển khoản, theo dõi đơn, yêu cầu trả hàng và đánh giá sản phẩm.
- Guest được đặt hàng. Khi đăng nhập, giỏ guest được merge theo quy tắc cộng số lượng nhưng không vượt tồn khả dụng/hạn mức flash sale.
- Khách chọn chi nhánh trước hoặc tại checkout. Nếu thiếu hàng, hệ thống gợi ý chi nhánh khác rồi tính lại phí và ETA; khách phải xác nhận trước khi tạo đơn.

### Cổng quản trị

- Tổ chức/chi nhánh/kho; người dùng, vai trò và quyền có phạm vi dữ liệu.
- Catalog/variant/media/thuộc tính; giá hiệu lực; flash sale cơ bản.
- Tồn kho, ledger, reservation, điều chỉnh, kiểm kê và chuyển kho.
- Đơn hàng, xác nhận thanh toán, fulfillment, giao hàng, trả hàng/hoàn tiền.
- CMS gồm trang giới thiệu/chính sách/hướng dẫn, tin/bài viết, category/tag và bài viết liên quan sản phẩm.
- Đánh giá verified-purchase có ảnh/video, moderation và phản hồi của shop/khách ở mức một cấp.
- Ảnh upload trực tiếp lên provider bên thứ ba qua signed upload; hệ thống quản lý asset metadata/usage, thông báo và báo cáo vận hành.
- Audit trail, optimistic locking, idempotency và outbox cho tác vụ bất đồng bộ.

## 2. Những gì loại khỏi V1

- POS, cash session/cash-up, quầy thu ngân, gift card và thanh toán tiền mặt.
- Split payment, split shipment, COD và tự động chuyển hàng giữa chi nhánh. Return theo sản phẩm được hỗ trợ; combo phải trả nguyên bộ.
- Voucher/coupon stacking, loyalty points, membership tier và flash sale phân quota theo kho.
- Bảo hành/sửa chữa/bảo trì, lịch lắp đặt, B2B quotation và công nợ.
- CRM automation, TikTok/Meta campaign management, data warehouse/BI nâng cao.

Vẫn lưu `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` ở order để không mất dữ liệu attribution.

## 3. Đánh giá source

| Nguồn | Có thể học/dùng lại | Không nên dùng nguyên trạng | Kết luận |
|---|---|---|---|
| `opensourcepos/opensourcepos` | Inventory ledger, multi-location, sale snapshot, receiving, reports, server-side permissions, migration/test/CI | Trọng tâm POS; controller lớn/legacy UI; mô hình cho phép âm kho; thiếu checkout reservation, shipping và flash sale e-commerce | Dùng làm reference pattern và test case, không fork làm nền |
| `thinh-doan/sales-and-warehouse-management-system` | Phân loại khách cá nhân/doanh nghiệp, line-item price snapshot, constraint SQL cơ bản | Có nguy cơ trừ tồn hai lần giữa app và trigger; cancel trả sai kho mặc định; password/RBAC yếu; ID `MAX+1`; thiếu test | Chỉ tham khảo nghiệp vụ nhỏ; không tái sử dụng code/schema |
| `han4219/DUNGCUTHEDUC` | Flow UI storefront/admin, login, catalog, cart, checkout, order và review | React 17/CRA + Express/Mongo cũ; `isAdmin` hai mức; product gộp price/quantity/category; cart model gần như trống; order dùng boolean paid/delivered; không test backend | Có thể tham khảo màn hình/flow; backend và domain phải thiết kế mới |
| Workspace `identity-service` | Role/role-group/user-group, audit, `@Version`, cache permission | Cấu trúc tài chính nhiều tầng có thể quá nặng cho cửa hàng | Dùng pattern RBAC/audit/locking, rút gọn entity |
| Workspace `etf-service` | `@RequiresPerm`, request filter, approval, transaction độc lập, audit và stateful order | Một số endpoint chưa gắn fine-grained permission; approval framework tổng quát khá nặng | Dùng permission guard + maker-checker tối giản |
| Workspace `admin-client` | `useCan`, ẩn/disable action, permission editor, modal/action patterns | Quyền suy ra từ URL dễ vỡ khi đổi route; parent permission dễ mở rộng quá mức | Dùng component/hook UX; mã quyền phải là business code, không sinh từ path |

## 4. Mẫu được tái sử dụng và phần phải cải thiện

### Tái sử dụng ở mức pattern

- `Role → Permission`, gán role cho user, màn hình matrix quyền.
- Optimistic `version` trên aggregate dễ tranh chấp: order, price, balance, approval, flash sale.
- Audit cho before/after, actor, request ID, lý do và nguồn thao tác.
- Event chỉ phát sau commit; outbox để tránh DB commit thành công nhưng job/message thất bại.
- Transaction độc lập cho xử lý batch; trả về từng phần tử thành công/thất bại.
- Admin action dùng `useCan` để ẩn/disable, nhưng API vẫn là nguồn quyết định cuối.

### Cải thiện bắt buộc

- Permission code ổn định dạng `inventory.stock.adjust`, không phụ thuộc URL/menu.
- Không có fail-open: quyền không tồn tại hoặc scope không hợp lệ phải deny và ghi security log.
- Parent/menu permission không tự động cấp CRUD cho child.
- Cache quyền có version; mọi thay đổi role/assignment làm tăng version hoặc evict ngay.
- Actor không xác định không được âm thầm đổi thành `SYSTEM`; system actor phải có credential/identity riêng.
- Approval chỉ dùng cho thao tác rủi ro, không bọc toàn bộ CRUD.

## 5. Giả định thiết kế mặc định

| Chủ đề | Giá trị đề xuất |
|---|---|
| Tiền tệ | VND; vẫn lưu `currency_code` để mở rộng |
| Reservation checkout | 30 phút |
| Reservation flash sale | 10 phút |
| Trừ `on_hand` | Khi fulfillment chuyển `SHIPPED` |
| Commit reservation | Khi payment `SUCCESS` |
| Thanh toán đến sau expiry | Chuyển `NEED_REVIEW`, không tự hồi sinh reservation |
| Tự hủy của khách | Chỉ trước payment `SUCCESS` |
| Nhận doanh thu | Khi order `COMPLETED` |
| Âm tồn | Không cho phép |
| Mỗi chi nhánh V1 | Đúng một kho hoạt động; schema vẫn cho phép nhiều kho về sau |
| Soft delete | Chỉ master data; transaction/ledger không xóa, chỉ reverse/cancel |
| Media | Provider-agnostic; DB không lưu binary/base64, chỉ asset ID/URL/metadata/usage |
