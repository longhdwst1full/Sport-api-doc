# Admin CRUD coverage V1

Ngày rà soát: 2026-08-30

## Đã có API thật và màn quản lý

| Khu vực | Read/list | Create | Update | Delete/lifecycle | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| Sản phẩm | Có | Có | Có | Publish; chưa archive | PostgreSQL; variant/price/combo qua workflow drawer |
| Thương hiệu | Có | Có | Có | Activate/deactivate | PostgreSQL; optimistic version; code immutable |
| Danh mục | Có | Có | Có | Activate/deactivate | PostgreSQL; parent immutable; không tắt cha khi còn con active |
| Chi nhánh + kho | Có | Có cùng nhau | Có cùng nhau | Activate/deactivate atomic | PostgreSQL; đúng rule 1 branch–1 warehouse |
| Tồn kho cơ bản | Có | Stock adjustment | Không sửa ledger | Không xóa | In-memory V1; UI gửi Idempotency-Key qua generated operation wrapper |
| Đánh giá | Có | Storefront chưa expose create | Moderate approve/reject | Không physical delete | In-memory V1; admin có confirmation |
| Nội dung | Có | Có | Chưa có | Chưa có | In-memory V1; CKEditor4 + Cloudinary đã tích hợp |
| IAM | User/role/permission list | Gán role | Chưa sửa hồ sơ user | Chưa revoke assignment | PostgreSQL; cần chốt provisioning/revoke policy |

## Chưa được coi là CRUD hoàn chỉnh

- Đơn hàng và Khách hàng đang dùng fixture ở admin; backend module vẫn scaffold, không tạo API CRUD giả.
- CMS chưa persist PostgreSQL, vì vậy edit/unpublish/delete bài viết chưa triển khai trong đợt này.
- Review và Inventory hiện là in-memory vertical slice; chưa có transaction/locking PostgreSQL production.
- Sản phẩm chưa có archive/reactivate endpoint; hiện lifecycle đạt create/update/publish.
- Media mới phục vụ upload/finalize trong form, chưa có media-library page độc lập.
- Tạo user, khóa user và revoke role assignment cần chốt actor/scope/audit rule trước khi mở UI.

## Dữ liệu demo PostgreSQL

Chạy:

```bash
yarn db:local:seed:demo
```

Lệnh chạy foundation seed trước rồi upsert 3 chi nhánh/kho, 3 thương hiệu, 3 danh mục
và 3 sản phẩm/SKU/giá. Script không chứa credential thật, không xóa dữ liệu khác và đã
được kiểm tra chạy lặp hai lần mà không phát sinh bản ghi trùng.
