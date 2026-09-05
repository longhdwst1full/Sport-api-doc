# Admin CRUD coverage V1

> **Document version:** 1.8.0
>
> **Last updated:** 2026-09-05
>
> **Change summary:** Bổ sung sáu API DELETE logic cho CRUD Sprint 1, không thay đổi nguyên tắc giữ lịch sử dữ liệu.

## Đã có API thật và màn quản lý

| Khu vực | Read/list | Create | Update | Delete/lifecycle | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Sản phẩm/combo | Có | Có | Có | `DELETE` → ARCHIVED; archive/reactivate | PostgreSQL; archive combo qua Product; reactivate luôn về DRAFT trước khi publish lại |
| Variant/SKU | Có trong product detail | Có | Có | `DELETE` → INACTIVE; archive/reactivate | PostgreSQL; optimistic version; SKU immutable; chặn archive component của combo published |
| Thương hiệu | Có | Có | Có | `DELETE` → INACTIVE; activate/deactivate | PostgreSQL; optimistic version; code immutable |
| Danh mục | Có | Có | Có | `DELETE` → INACTIVE; activate/deactivate | PostgreSQL; parent immutable; không tắt cha khi còn con active |
| Chi nhánh + kho | Có | Có cùng nhau | Có cùng nhau | `DELETE` → INACTIVE atomic; activate/deactivate | PostgreSQL; đúng rule 1 branch–1 warehouse |
| Tồn kho cơ bản | Có | Stock adjustment | Không sửa ledger | Không xóa | PostgreSQL; action theo dòng tự điền kho/SKU và snapshot hiện tại; adjustment, movement và balance ghi atomic; UI gửi Idempotency-Key qua generated operation wrapper |
| Đánh giá | Có | Storefront chưa expose create | Moderate approve/reject | Không physical delete | In-memory V1; admin có confirmation |
| Nội dung | Có | Có | Chưa có | Chưa có | In-memory V1; CKEditor4 built-in Image dialog; editor lazy-load và có visual states trong Storybook |
| IAM | User/role/permission list | Admin gốc tạo account + gán BRANCH_MANAGER/STAFF theo branch | Chưa sửa hồ sơ user | Admin gốc lock/unlock, revoke session và assignment cấp dưới | PostgreSQL; OWNER bất biến; login thành công reset failed attempts; revoke giữ lịch sử và audit |

## Chưa được coi là CRUD hoàn chỉnh

- Đơn hàng/POS tại cửa hàng và Khách hàng đang dùng fixture ở admin; backend module vẫn scaffold, không tạo API CRUD giả. Đây là delivery wave sau Sprint 1 vì phải hoàn thành đồng bộ Order snapshot, Payment, Inventory reservation/commit và Fulfillment.
- CMS chưa persist PostgreSQL, vì vậy edit/unpublish/delete bài viết chưa triển khai trong đợt này.
- Review hiện là in-memory vertical slice; chưa có persistence PostgreSQL production.
- Inventory core đã persist PostgreSQL và có transaction/locking/idempotency; còn thiếu full branch-scope HTTP regression trước khi ký Sprint DONE.
- Media mới phục vụ upload/finalize trong form, chưa có media-library page độc lập.
- Lock/unlock user, revoke session, revoke role assignment và audit query đã có API/UI thật; còn thiếu QA acceptance toàn màn.

## Quy ước DELETE Sprint 1

- `DELETE` là command lifecycle có optimistic version, permission server-side và audit; không thực hiện SQL hard delete.
- Có sáu operation: branch+kho, brand, category, product/combo, variant/SKU và product-media link.
- Product-media chỉ bỏ liên kết khỏi sản phẩm; `media_assets` và asset bên provider vẫn được giữ để tránh xóa nhầm tài nguyên đang được dùng nơi khác.
- User/role dùng lock/revoke; tồn kho dùng adjustment/ledger; price và audit là lịch sử bất biến. Các nhóm này cố ý không expose `DELETE`.
- Admin SDK cho sáu operation được sinh từ OpenAPI. UI hiện giữ action lifecycle `archive/deactivate` có ý nghĩa nghiệp vụ rõ; có thể chuyển sang hook `delete*` mà không tự viết URL/DTO.

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
yarn db:seed:demo
```

Lệnh chạy foundation seed trước rồi upsert 3 chi nhánh/kho, 3 thương hiệu, 3 danh mục
và 3 sản phẩm/SKU/giá. Script không chứa credential thật, không xóa dữ liệu khác và đã
được kiểm tra chạy lặp hai lần mà không phát sinh bản ghi trùng.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-04 | Cập nhật coverage CRUD, bootstrap Admin, inventory và rich-text editor. | Current worktree Admin review |
| 1.1.0 | 2026-09-04 | Bỏ custom Cloudinary uploader khỏi CKEditor 4 trong Product/CMS form. | User decision 2026-09-04 |
| 1.2.0 | 2026-09-04 | Đồng bộ coverage hiện tại và ghi nhận bản ổn định login, CKEditor, required marker, menu Admin. | Admin stabilization review 2026-09-04 |
| 1.3.0 | 2026-09-04 | Tự sinh slug sản phẩm từ tên và mã trong create flow, vẫn hỗ trợ chỉnh tay/tạo lại. | Product form UX 2026-09-04 |
| 1.4.0 | 2026-09-04 | Chuyển lệnh seed/demo Admin sang workflow Supabase online. | Supabase workflow 2026-09-04 |
| 1.5.0 | 2026-09-04 | Chốt một Admin gốc, lockout feedback/reset attempts và loại Request ID khỏi toast. | DBAPI-20260904-SINGLE-ROOT-ADMIN |
| 1.6.0 | 2026-09-05 | Sửa CKEditor timeout/skeleton, harden Admin runtime và bổ sung stock-adjustment prefill theo từng dòng. | Sprint 1 UI stabilization 2026-09-05 |
| 1.7.0 | 2026-09-05 | Thêm Storybook visual review cho Admin component/layout và thay CKEditor test bằng ba visual states. | Admin Storybook foundation 2026-09-05 |
| 1.8.0 | 2026-09-05 | Bổ sung sáu HTTP DELETE logic cho aggregate Sprint 1 và ghi rõ nhóm dữ liệu cố ý không được xóa. | API-20260905-LOGICAL-DELETE-V1 |
