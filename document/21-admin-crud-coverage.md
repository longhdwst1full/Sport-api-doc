# Admin CRUD coverage V1

> **Document version:** 1.14.0
>
> **Last updated:** 2026-09-15
>
> **Change summary:** Bán tại quầy đã nghiệm thu một đơn thành công và có màn Admin; ngừng hoạt động chi nhánh Đà Nẵng, cửa hàng chỉ còn Hồ Chí Minh và Hà Nội.

## Bán tại quầy

`POST /admin/orders/pos` (`createPosOrder`, quyền `order.manage`, bắt buộc `Idempotency-Key`).

**Đi qua đúng đường của đơn online, không có đường trừ kho riêng:**

```
checkout session -> đặt chỗ tồn kho -> place() -> CONFIRMED -> PICKING -> PACKED -> SHIPPED -> DELIVERED
```

`place()` khoá `FOR UPDATE` cả checkout lẫn reservation; `SHIPPED` là nơi tồn kho thực sự bị
trừ nên **không được bỏ qua**. Hai đường trừ kho song song là nguồn gốc của bán vượt hàng.

| Điểm | Cách xử lý |
| --- | --- |
| Chi nhánh bán | Lấy từ phạm vi phân quyền. Tài khoản toàn hệ thống **bắt buộc** truyền `branchId` vì không gắn chi nhánh nào; nhân viên chi nhánh **không được** bán từ kho chi nhánh khác |
| Khách hàng | Tìm theo số điện thoại, chưa có thì tạo mới để lần sau tra được bảo hành |
| Giao hàng | `BRANCH_FREE`, phí 0. Địa chỉ đơn ghi địa chỉ chi nhánh bán, không bịa địa chỉ khách |
| Thanh toán | `CASH` hoặc `BANK_TRANSFER`, ghi `SUCCESS` ngay, `confirmedBy` là người thu |
| Truy vết | Bút toán thanh toán lưu `soldByUserId`, hình thức và ghi chú tại quầy |
| Kênh | Dùng lại giá trị `STORE` sẵn có của `orders_channel_check` |
| Hết hàng | Kiểm tồn **sớm**, trước khi tạo khách/giỏ/checkout, để lần gọi hỏng không để lại bản ghi mồ côi |

**Đã nghiệm thu (2026-09-15):** `ORD-20260915-00000025` — `DELIVERED`, thanh toán `CASH`/`SUCCESS`,
kênh `STORE`, tồn kho giảm đúng số bán, 6 bước lịch sử đơn và 9 bản ghi audit nối tiếp trong cùng
request. Các nhánh xác thực đã kiểm: thiếu `Idempotency-Key` → 400, tài khoản toàn hệ thống thiếu
`branchId` → 400, hết hàng → 409 kèm số còn và số cần.

Nghiệm thu này phát hiện 5 lỗi chặn đã sửa, đáng chú ý nhất: ràng buộc phương thức thanh toán của
`checkout_sessions` chưa nhận VNPAY/CASH (làm vỡ cả checkout VNPAY trên storefront, không riêng POS)
và audit trùng `(request_id, sequence_no)` vì cả hệ thống ghi cứng `sequenceNo: 1`.

**Màn Admin:** `admin/src/features/pos` (route `/pos`, quyền `order.manage`) — chọn hàng, lập giỏ,
thu tiền, in biên lai. Giới hạn hiện tại: lookup biến thể chưa trả cờ combo và tồn khả dụng nên giỏ
chưa hiển thị hai thông tin đó; xem `admin/src/features/pos/README.md`.

## Chi nhánh đang vận hành

Chỉ Hồ Chí Minh (`CN-HCM-01`) và Hà Nội (`CN-HN-01`). Đà Nẵng (`CN-DN-01`) là dữ liệu dựng sẵn giai
đoạn demo, đã chuyển `INACTIVE` cùng kho `KHO-DN-01` — ngừng hoạt động thay vì xoá cứng vì chi nhánh
và kho được tham chiếu từ sổ cái chỉ-ghi-thêm. Kiểm trước khi ngừng: 0 đơn, 0 phiên checkout, 0 giỏ,
0 gán quyền, 0 biểu giá vận chuyển, 0 số dư tồn kho.

## Báo cáo & thống kê

Module `Admin Reporting` (`api/src/modules/reporting/`) cung cấp 4 endpoint, thay thế số liệu
tiến độ lập trình vốn hiển thị nhầm ở Dashboard:

| Operation | Quyền | Nội dung |
| --- | --- | --- |
| `getAdminReportOverview` | `report.operation.view` | Đơn hôm nay / 30 ngày, đơn chờ giao, đơn huỷ, sản phẩm đang bán, số khách |
| `getAdminReportRevenue` | `report.revenue.view` | Doanh thu đã thực nhận, tiền chờ thu, giá trị trung bình mỗi đơn, chuỗi theo ngày |
| `getAdminReportInventory` | `report.inventory.view` | SKU hết hàng bán và chạm ngưỡng đặt lại |
| `getAdminReportTopProducts` | `report.revenue.view` | Bán chạy theo số lượng và doanh thu |

**Định nghĩa doanh thu:** chỉ cộng đơn có `paymentStatus = SUCCESS` — tiền đã thực nhận.
Đơn COD chưa giao và chuyển khoản chờ xác nhận tách riêng ở `pendingRevenue`.

**Phạm vi:** mọi số liệu lọc theo chi nhánh mà người đăng nhập được phân quyền; chỉ phạm vi
GLOBAL mới thấy toàn hệ thống.

Ba mã quyền `report.*` đã được khai báo từ Sprint 1 nhưng tới 2026-09-15 mới có controller dùng.

## Ngoại lệ của quy ước "DELETE = xoá mềm"

Sprint 1 chốt mọi `DELETE` là xoá logic. **Thương hiệu là ngoại lệ duy nhất** kể từ 2026-09-15:
`deleteAdminBrand` xoá hẳn bản ghi, và chỉ chạy khi chưa có sản phẩm nào tham chiếu
(`Product.brand` là khoá ngoại RESTRICT). Thương hiệu đang dùng thì API trả 409 kèm số sản phẩm
đang gắn, người dùng chuyển sang **Ngừng** thay vì xoá.

Lý do đổi: tạo nhầm một thương hiệu trước đây không gỡ đi được, vì `DELETE` chỉ là bí danh của
`deactivate`. Danh mục, chi nhánh, sản phẩm, biến thể và ảnh **giữ nguyên** hành vi xoá mềm, vì
chúng bị dòng đơn hàng và sổ kho tham chiếu.

Guard test: `src/modules/catalog/logical-delete.controller.spec.ts`.

## Đã có API thật và màn quản lý

| Khu vực | Read/list | Create | Update | Delete/lifecycle | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Sản phẩm/combo | Có | Có | Có | `DELETE` → ARCHIVED; archive/reactivate | PostgreSQL; archive combo qua Product; reactivate luôn về DRAFT trước khi publish lại |
| Variant/SKU | Có trong product detail | Có | Có | `DELETE` → INACTIVE; archive/reactivate | PostgreSQL; optimistic version; SKU immutable; chặn archive component của combo published |
| Thương hiệu | Có | Có | Có | `DELETE` → INACTIVE; activate/deactivate | PostgreSQL; optimistic version; code immutable |
| Danh mục | Có | Có | Có | `DELETE` → INACTIVE; activate/deactivate | PostgreSQL; parent immutable; không tắt cha khi còn con active |
| Chi nhánh + kho | Có | Có cùng nhau | Có cùng nhau | `DELETE` → INACTIVE atomic; activate/deactivate | PostgreSQL; đúng rule 1 branch–1 warehouse |
| Tồn kho cơ bản | Có | Stock adjustment | Không sửa ledger | Không xóa | PostgreSQL; action theo dòng tự điền kho/SKU và snapshot hiện tại; adjustment, movement và balance ghi atomic; UI gửi Idempotency-Key qua generated operation wrapper |
| Đánh giá | Có | Storefront chưa expose create | Moderate approve/reject | `DELETE` → REJECTED/ẩn | In-memory P1; expected version; Admin confirmation; vẫn giữ lịch sử kiểm duyệt |
| Nội dung | Có | Có | Chưa có | `DELETE` → ARCHIVED | In-memory P1; expected version; public API chỉ trả PUBLISHED; CKEditor4 lazy-load |
| IAM | User/role/permission list | Admin gốc tạo account + gán BRANCH_MANAGER/STAFF theo branch | Chưa sửa hồ sơ user | `DELETE` staff → LOCKED; lock/unlock; revoke session và assignment | PostgreSQL; DELETE tái sử dụng lifecycle lock, revoke session và audit atomic; OWNER bất biến |

## Chưa được coi là CRUD hoàn chỉnh

- Đơn hàng/POS tại cửa hàng và Khách hàng đang dùng fixture ở admin; backend module vẫn scaffold, không tạo API CRUD giả. Đây là delivery wave sau Sprint 1 vì phải hoàn thành đồng bộ Order snapshot, Payment, Inventory reservation/commit và Fulfillment.
- CMS chưa persist PostgreSQL; create/archive chạy trong vertical slice in-memory và chưa được coi là durable production CRUD. Edit vẫn chưa triển khai.
- Review hiện là in-memory vertical slice; moderate/delete giữ trạng thái trong runtime nhưng chưa có persistence PostgreSQL production.
- Inventory core đã persist PostgreSQL và có transaction/locking/idempotency; còn thiếu full branch-scope HTTP regression trước khi ký Sprint DONE.
- Media mới phục vụ upload/finalize trong form, chưa có media-library page độc lập.
- Lock/unlock user, revoke session, revoke role assignment và audit query đã có API/UI thật; còn thiếu QA acceptance toàn màn.

## Quy ước DELETE Sprint 1

- `DELETE` là command lifecycle có optimistic version, permission server-side và audit; không thực hiện SQL hard delete.
- Có sáu operation: branch+kho, brand, category, product/combo, variant/SKU và product-media link.
- Product-media chỉ bỏ liên kết khỏi sản phẩm; `media_assets` và asset bên provider vẫn được giữ để tránh xóa nhầm tài nguyên đang được dùng nơi khác.
- User cấp dưới có `DELETE` tương thích lifecycle lock + revoke session; OWNER không thể xóa. Role dùng revoke; tồn kho dùng adjustment/ledger; price và audit là lịch sử bất biến.
- Admin SDK cho chín operation được sinh từ OpenAPI; UI gọi generated hooks, không tự viết URL/DTO.
- CMS post và review có `DELETE` optimistic theo version; post chuyển ARCHIVED, review chuyển REJECTED/ẩn và vẫn hiện trong danh sách Admin.

## Ổn định trải nghiệm Admin

- Route `/login` luôn truy cập được khi chưa authenticated; flag mở quyền development không còn tự đánh dấu đã đăng nhập.
- Route protected/permission lấy trạng thái từ auth context và backend `/me`; permission bypass chỉ tác động permission gate trong development.
- CKEditor dùng đúng `scriptUrl`, `data`, config và `setData` hydration theo `admin-client`, lazy-load thành chunk riêng; đã bỏ timer 10 giây vốn gây false timeout/skeleton.
- Storybook 10 nằm riêng trong Admin workspace, có Docs/a11y và stories cho CKEditor, QueryErrorAlert, ManagementPage, StatusTag và full AdminLayout.
- Auth/permission layout chịu được response phiên cũ thiếu `permissions/scopes`; DEV Error Boundary hiện lỗi gốc và có action xóa phiên về login.
- Form IAM, Organization, Catalog, Product, Inventory và Auth hiển thị `*` cho field bắt buộc theo schema validation.
- Product, Brand, Category, Branch/Warehouse, Variant và Media điền lại record đang sửa; Inventory không sửa đè ledger mà mở adjustment theo đúng balance đang chọn.
- Menu chia thành Tổng quan, Bán hàng, Sản phẩm & danh mục, Kho & vận hành, Nội dung & trải nghiệm, Tổ chức và Quản trị hệ thống.
- Form tạo sản phẩm tự sinh slug theo mẫu `{tên-không-dấu}-{mã-sản-phẩm}`; dừng tự động khi người dùng sửa và có nút tạo lại. Form sửa không tự đổi slug để tránh làm thay đổi URL ngoài ý muốn.

## Tài khoản quản trị development

- Foundation seed tạo đúng một bootstrap OWNER: `bootstrap-admin@example.invalid`.
- Password khởi tạo là `Aa@123456`; bắt buộc đổi ngay sau lần đăng nhập đầu tiên.
- Seed chạy lặp chỉ bổ sung credential cho bootstrap record cũ chưa có password, không reset password đã đổi và không tạo OWNER bootstrap thứ hai.
- OWNER không xuất hiện trong lựa chọn gán quyền; chỉ Admin gốc được tạo/quản lý account và assignment cấp dưới.
- Toast lỗi chỉ hiện thông báo nghiệp vụ; Request ID vẫn lưu trong error payload/log và màn Audit, không hiển thị cho người dùng cuối.
- Credential bootstrap không được sử dụng cho staging/production.

## Dữ liệu demo PostgreSQL

Chạy:

```bash
yarn db:seed:demo --confirm-manual-seed
```

Đây là lệnh manual-only, chỉ chạy khi có yêu cầu xác nhận. Lệnh chạy foundation seed trước,
sau đó chỉ tạo dữ liệu demo còn thiếu và tái sử dụng media hiện có; không ghi đè dữ liệu
Admin đã chỉnh. Dữ liệu hiện tại gồm 3 chi nhánh/kho, 9 thương hiệu, 7 danh mục và 20 sản phẩm.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.13.0 | 2026-09-15 | Thêm `createPosOrder` cho bán tại quầy; ghi rõ vì sao không dựng đường trừ kho riêng. | POS-20260915-COUNTER-ORDER |
| 1.12.0 | 2026-09-15 | Thêm module Admin Reporting với 4 endpoint báo cáo; Dashboard chuyển sang số liệu kinh doanh thật. | REPORT-20260915-DASHBOARD |
| 1.11.0 | 2026-09-15 | Thương hiệu: DELETE thành xoá thật có ràng buộc tham chiếu. | CRUD-20260915-BRAND-HARD-DELETE |
| 1.10.0 | 2026-09-06 | Khóa demo seed manual-only; mặc định giữ dữ liệu Admin và tái sử dụng media. | Demo seed safety hardening |
| 1.0.0 | 2026-09-04 | Cập nhật coverage CRUD, bootstrap Admin, inventory và rich-text editor. | Current worktree Admin review |
| 1.1.0 | 2026-09-04 | Bỏ custom Cloudinary uploader khỏi CKEditor 4 trong Product/CMS form. | User decision 2026-09-04 |
| 1.2.0 | 2026-09-04 | Đồng bộ coverage hiện tại và ghi nhận bản ổn định login, CKEditor, required marker, menu Admin. | Admin stabilization review 2026-09-04 |
| 1.3.0 | 2026-09-04 | Tự sinh slug sản phẩm từ tên và mã trong create flow, vẫn hỗ trợ chỉnh tay/tạo lại. | Product form UX 2026-09-04 |
| 1.4.0 | 2026-09-04 | Chuyển lệnh seed/demo Admin sang workflow Supabase online. | Supabase workflow 2026-09-04 |
| 1.5.0 | 2026-09-04 | Chốt một Admin gốc, lockout feedback/reset attempts và loại Request ID khỏi toast. | DBAPI-20260904-SINGLE-ROOT-ADMIN |
| 1.6.0 | 2026-09-05 | Sửa CKEditor timeout/skeleton, harden Admin runtime và bổ sung stock-adjustment prefill theo từng dòng. | Sprint 1 UI stabilization 2026-09-05 |
| 1.7.0 | 2026-09-05 | Thêm Storybook visual review cho Admin component/layout và thay CKEditor test bằng ba visual states. | Admin Storybook foundation 2026-09-05 |
| 1.8.0 | 2026-09-05 | Bổ sung sáu HTTP DELETE logic cho aggregate Sprint 1 và ghi rõ nhóm dữ liệu cố ý không được xóa. | API-20260905-LOGICAL-DELETE-V1 |
| 1.9.0 | 2026-09-05 | Bổ sung DELETE logic và Admin action cho bài viết, đánh giá và staff; giữ lifecycle/history hiện hữu. | API-20260905-ADMIN-DELETE-EXTENSION |
