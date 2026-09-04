# Admin CRUD coverage V1

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-04
>
> **Change summary:** Cập nhật rich-text form dùng Image dialog của CKEditor 4 và không còn custom Cloudinary uploader.

## Đã có API thật và màn quản lý

| Khu vực | Read/list | Create | Update | Delete/lifecycle | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Sản phẩm/combo | Có | Có | Có | Publish/archive/reactivate | PostgreSQL; archive combo qua Product; reactivate luôn về DRAFT trước khi publish lại |
| Variant/SKU | Có trong product detail | Có | Chưa sửa metadata | Archive/reactivate | PostgreSQL; optimistic version; chặn archive component của combo published |
| Thương hiệu | Có | Có | Có | Activate/deactivate | PostgreSQL; optimistic version; code immutable |
| Danh mục | Có | Có | Có | Activate/deactivate | PostgreSQL; parent immutable; không tắt cha khi còn con active |
| Chi nhánh + kho | Có | Có cùng nhau | Có cùng nhau | Activate/deactivate atomic | PostgreSQL; đúng rule 1 branch–1 warehouse |
| Tồn kho cơ bản | Có | Stock adjustment | Không sửa ledger | Không xóa | In-memory V1; UI gửi Idempotency-Key qua generated operation wrapper |
| Đánh giá | Có | Storefront chưa expose create | Moderate approve/reject | Không physical delete | In-memory V1; admin có confirmation |
| Nội dung | Có | Có | Chưa có | Chưa có | In-memory V1; CKEditor4 built-in Image dialog; có loading/error/retry và HTML fallback |
| IAM | User/role/permission list | Tạo staff + gán role branch; gán thêm role | Chưa sửa hồ sơ user | Lock/unlock + revoke toàn bộ session | PostgreSQL; unlock reset Argon2 default password; chưa có revoke assignment API |

## Chưa được coi là CRUD hoàn chỉnh

- Đơn hàng/POS tại cửa hàng và Khách hàng đang dùng fixture ở admin; backend module vẫn scaffold, không tạo API CRUD giả. Đây là delivery wave sau Sprint 1 vì phải hoàn thành đồng bộ Order snapshot, Payment, Inventory reservation/commit và Fulfillment.
- CMS chưa persist PostgreSQL, vì vậy edit/unpublish/delete bài viết chưa triển khai trong đợt này.
- Review và Inventory hiện là in-memory vertical slice; chưa có transaction/locking PostgreSQL production.
- Variant chưa có update metadata; hiện đạt create/archive/reactivate.
- Media mới phục vụ upload/finalize trong form, chưa có media-library page độc lập.
- Lock/unlock user và revoke toàn bộ session đã có API/UI thật; còn thiếu revoke role assignment và audit query UI/API.

## Tài khoản quản trị local/dev

- Foundation seed tạo đúng một bootstrap OWNER: `bootstrap-admin@example.invalid`.
- Password khởi tạo là `Aa@123456`; bắt buộc đổi ngay sau lần đăng nhập đầu tiên.
- Seed chạy lặp chỉ bổ sung credential cho bootstrap record cũ chưa có password, không reset password đã đổi và không tạo OWNER bootstrap thứ hai.
- Credential bootstrap không được sử dụng cho staging/production.

## Dữ liệu demo PostgreSQL

Chạy:

```bash
yarn db:local:seed:demo
```

Lệnh chạy foundation seed trước rồi upsert 3 chi nhánh/kho, 3 thương hiệu, 3 danh mục
và 3 sản phẩm/SKU/giá. Script không chứa credential thật, không xóa dữ liệu khác và đã
được kiểm tra chạy lặp hai lần mà không phát sinh bản ghi trùng.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-04 | Cập nhật coverage CRUD, bootstrap Admin, inventory và rich-text editor. | Current worktree Admin review |
| 1.1.0 | 2026-09-04 | Bỏ custom Cloudinary uploader khỏi CKEditor 4 trong Product/CMS form. | User decision 2026-09-04 |
