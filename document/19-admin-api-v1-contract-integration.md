# Admin và Storefront API v1 contract integration

> **Document version:** 1.2.2
>
> **Last updated:** 2026-09-06
>
> **Change summary:** Sửa production guard cho endpoint chỉ yêu cầu xác thực; `/admin/auth/me` không còn lỗi 500 khi không khai báo permission cụ thể.

## Nguyên tắc đã áp dụng

- API producer là NestJS decorators/DTO dưới `api/src`; không sửa tay OpenAPI JSON/YAML.
- Contract frontend là `document/api/openapi-v1.yaml`, được xuất cùng nguồn với `api/openapi/openapi.json`.
- Admin chỉ gọi API qua Orval output trong `admin/src/generated/api`; không viết URL/DTO thủ công trong feature.
- Toàn bộ endpoint nằm dưới `/api/v1`.
- Search dùng cho dropdown/reference được tách khỏi API danh sách quản trị và backend chỉ trả record `ACTIVE`.
- Search, lọc và pagination của lookup được xử lý server-side; FE debounce và AbortSignal do generated TanStack Query hook quản lý.

## API matrix

| Mục đích | Method/path v1 | Operation ID | Permission | Consumer Admin |
| --- | --- | --- | --- | --- |
| Danh sách branch quản trị | `GET /api/v1/admin/organization/branches` | `listAdminBranches` | `org.branch.view` | Trang Organization |
| Tạo branch + kho 1:1 | `POST /api/v1/admin/organization/branches` | `createAdminBranchWithWarehouse` | `org.branch.manage` + `org.warehouse.manage` | Organization drawer |
| Cập nhật branch + kho 1:1 | `PATCH /api/v1/admin/organization/branches/{id}` | `updateAdminBranchWithWarehouse` | `org.branch.manage` + `org.warehouse.manage` | Organization drawer |
| Bật/tắt branch + kho | `POST .../branches/{id}/activate|deactivate` | `activateAdminBranchWithWarehouse` / `deactivateAdminBranchWithWarehouse` | `org.branch.manage` + `org.warehouse.manage` | Organization table actions |
| Xóa logic branch + kho | `DELETE /api/v1/admin/organization/branches/{id}` | `deleteAdminBranchWithWarehouse` | `org.branch.manage` + `org.warehouse.manage` | Chuyển đồng thời branch và warehouse sang `INACTIVE`; body có hai expected version |
| Search branch active | `GET /api/v1/admin/organization/branches/active` | `searchActiveAdminBranches` | `org.branch.view` | Gán role scope BRANCH |
| Search warehouse active | `GET /api/v1/admin/organization/warehouses/active` | `searchActiveAdminWarehouses` | `org.warehouse.view` | Gán role scope WAREHOUSE |
| Danh sách role quản trị | `GET /api/v1/admin/iam/roles` | `listAdminRoles` | `iam.role.view` | Tab Role |
| Search role active | `GET /api/v1/admin/iam/roles/active` | `searchActiveAdminRoles` | `iam.role.view` | Gán role cho user |
| Gán role cấp dưới | `POST /api/v1/admin/iam/users/{userId}/role-assignments` | `assignAdminUserRole` | `iam.assignment.manage` — OWNER duy nhất | Chỉ BRANCH_MANAGER/STAFF + branchId |
| Thu hồi assignment cấp dưới | `POST /api/v1/admin/iam/users/{userId}/role-assignments/{assignmentId}/revoke` | `revokeAdminUserRoleAssignment` | `iam.assignment.manage` — OWNER duy nhất | Cấm thu hồi OWNER |
| Tạo account cấp dưới + branch role | `POST /api/v1/admin/iam/users` | `createAdminStaffUser` | `iam.user.manage` — OWNER duy nhất | Chỉ BRANCH_MANAGER/STAFF |
| Xóa logic account cấp dưới | `DELETE /api/v1/admin/iam/users/{userId}` | `deleteAdminStaffUser` | `iam.user.manage` — OWNER duy nhất | Chuyển LOCKED, revoke session và audit; cấm OWNER |
| CRUD lifecycle brand | `GET/POST/PATCH/DELETE` + `POST .../{id}/activate|deactivate` | `list/create/update/delete/activate/deactivateAdminBrand` | `catalog.brand.view/manage` | `DELETE` chuyển `INACTIVE`; không xóa row |
| CRUD lifecycle category | `GET/POST/PATCH/DELETE` + `POST .../{id}/activate|deactivate` | `list/create/update/delete/activate/deactivateAdminCategory` | `catalog.category.view/manage` | `DELETE` chuyển leaf category sang `INACTIVE`; chặn khi còn child active |
| Product SPU create/update/detail | `POST/PATCH/GET /api/v1/admin/products...` | `create/update/getAdminProduct` | `catalog.product.manage/view` | Product create/edit drawer + workflow detail |
| Điều chỉnh kho | `POST /api/v1/admin/inventory/adjustments` | `createStockAdjustment` | `inventory.stock.adjust` | Inventory drawer; generated request option truyền Idempotency-Key |
| Kiểm duyệt đánh giá | `PATCH /api/v1/admin/reviews/{id}/moderation` | `moderateAdminReview` | `review.moderate` | Reviews actions |
| Xóa/ẩn đánh giá | `DELETE /api/v1/admin/reviews/{id}` | `deleteAdminReview` | `review.moderate` | Chuyển REJECTED theo expected version; giữ lịch sử Admin |
| Xóa/lưu trữ bài viết | `DELETE /api/v1/admin/content/posts/{id}` | `deleteAdminPost` | `content.post.manage` | Chuyển ARCHIVED theo expected version; public API chỉ trả PUBLISHED |
| Archive/reactivate product hoặc combo | `POST .../products/{id}/archive|reactivate` | `archiveAdminProduct` / `reactivateAdminProduct` | `catalog.product.publish` | Product workflow drawer |
| Xóa logic product hoặc combo | `DELETE /api/v1/admin/products/{id}` | `deleteAdminProduct` | `catalog.product.publish` | Tái sử dụng invariant archive; body có `expectedVersion` |
| Archive/reactivate variant | `POST .../products/variants/{id}/archive|reactivate` | `archiveAdminProductVariant` / `reactivateAdminProductVariant` | `catalog.product.manage` | Product workflow drawer |
| Xóa logic variant/SKU | `DELETE /api/v1/admin/products/variants/{variantId}` | `deleteAdminProductVariant` | `catalog.product.manage` | Chuyển `INACTIVE`; chặn component đang thuộc combo published |
| Sửa metadata variant | `PATCH /api/v1/admin/products/variants/{variantId}` | `updateAdminProductVariant` | `catalog.product.manage` | Variant edit drawer; SKU bất biến |
| Product media lifecycle | `POST/PATCH .../products/{id}/media...` | `attach/update/reorder/archiveAdminProductMedia` | `catalog.product.manage` | Product media panel |
| Xóa logic liên kết ảnh sản phẩm | `DELETE /api/v1/admin/products/{id}/media/{mediaId}` | `deleteAdminProductMedia` | `catalog.product.manage` | Chuyển link `INACTIVE`, không xóa `media_assets` hay asset trên provider |
| Finalize media asset | `POST /api/v1/admin/media/uploads/finalize` | `finalizeAdminMediaUpload` | `media.asset.upload` | Cloudinary upload adapter; verify rồi persist idempotent |
| Search SKU active để tạo combo | `GET /api/v1/admin/products/variants/active` | `searchActiveAdminProductVariants` | `catalog.product.view` | Combo builder; chỉ SKU thường ACTIVE, không nested combo |
| Thay giá hiện hành atomic | `POST /api/v1/admin/products/variants/{variantId}/prices/replace` | `replaceAdminProductPrice` | `catalog.price.manage` | Price form gửi expected price id/version |
| Lịch giá SKU | `GET /api/v1/admin/products/variants/{variantId}/prices` | `getAdminProductPriceTimeline` | `catalog.price.view` | Current/upcoming/history; history chỉ đọc |
| Audit cursor query | `GET /api/v1/admin/audit-logs` | `listAdminAuditLogs` | `iam.audit.view` + GLOBAL scope | Filter action/entity/request/time; redacted snapshots |
| Customer register | `POST /api/v1/auth/register` | `registerCustomer` | Public + rate limit | Storefront `/register` |
| Customer login email/phone | `POST /api/v1/auth/login` | `loginCustomer` | Public + rate limit | Storefront `/login` |
| Customer refresh/logout/me | `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` | `refreshCustomerToken`, `logoutCustomer`, `getCustomerCurrentUser` | Token/session | Generated Storefront Auth SDK |
| Staff login email/phone | `POST /api/v1/admin/auth/login` | `loginAdmin` | Public + rate limit; chỉ userType STAFF | Admin Login |
| Staff đổi mật khẩu bắt buộc | `POST /api/v1/admin/auth/change-password` | `changeAdminPassword` | Verified token | Forced-password page; trước khi đổi chỉ me/change-password/logout |

API `/active` nhận `search`, `page`, `limit`; warehouse nhận thêm `branchId`. Lookup SKU tìm theo `sku/name`, chỉ trả variant ACTIVE thuộc Product STANDARD chưa archive và loại variant đã là combo. Response thống nhất:

```json
{
  "items": [{ "id": "uuid", "code": "CODE", "label": "Display label" }],
  "meta": { "page": 1, "limit": 20, "total": 1, "hasMore": false }
}
```

Các operation `DELETE` của Sprint 1 đều nhận request body chứa optimistic version. Lặp lại request với version cũ không làm xóa thêm dữ liệu và trả conflict/invalid transition theo error envelope chuẩn. Các route `POST .../deactivate|archive` cũ vẫn được giữ để tương thích với Admin hiện tại; không có hard delete cho master, transaction, ledger, audit hoặc root IAM.

## Error contract duy nhất

Mọi exception đi qua global filter và trả cùng envelope:

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [{ "field": "limit", "code": "MAX", "message": "..." }],
  "path": "/api/v1/admin/iam/roles/active?limit=100",
  "method": "GET",
  "timestamp": "2026-08-29T00:00:00.000Z",
  "requestId": "request-id"
}
```

Admin dùng `getApiErrorMessage` cho lỗi form/query và `getApiFieldErrors` để map `details[].field` về React Hook Form. Lỗi mạng/legacy vẫn có fallback, không làm hỏng transport.

## Evidence và checklist

- [x] OpenAPI có bốn lookup operation: branch, warehouse, role và `searchActiveAdminProductVariants`.
- [x] Query types trong OpenAPI là `string/number/uuid`, không còn schema `Object` sai.
- [x] 400/401/403 của API lookup tham chiếu `ErrorResponseDto`.
- [x] Admin SDK được regenerate bằng Orval; không sửa tay generated files.
- [x] Drawer gán role chỉ import generated hooks/DTO.
- [x] Role/branch/warehouse search debounce 300 ms; generated hooks truyền AbortSignal.
- [x] Scope mapper không gửi branch/warehouse ID thừa.
- [x] API unit test kiểm tra search/pagination/error normalization.
- [x] API e2e kiểm tra prefix v1, success, validation error và forbidden error.
- [x] Admin unit test kiểm tra error parser và scope mapper.
- [x] Persisted IAM/Organization adapter được dùng khi `DATABASE_ENABLED=true`.
- [x] Brand/category và branch/kho update dùng expected version; activate/deactivate không xóa vật lý.
- [x] Demo seed chạy lặp hai lần trên PostgreSQL local, không nhân bản dữ liệu.
- [x] Staff create dùng Argon2 default password, tạo user + assignment + audit atomic; API không trả credential/hash.
- [x] `OWNER` chỉ thuộc fixed bootstrap Admin; Branch Manager không có quyền tạo/quản lý/gán account.
- [x] Sai password lần 5 và account đã khóa trả `ACCOUNT_LOCKED`; login thành công reset attempts/lock metadata; toast Admin không ghép Request ID.
- [x] Register/login/change-password trim khoảng trắng hai đầu password trước validation/hash/verify; login đồng thời trim identifier.
- [x] Product/combo/variant lifecycle dùng named actions và optimistic version; storefront không trả archived/inactive data.
- [x] Product có discriminator `STANDARD|BUNDLE`; combo nằm theo từng SKU, không flatten ở Product.
- [x] Product workflow dùng active SKU lookup generated từ OpenAPI; không tải toàn bộ danh sách quản trị để dựng combo.
- [x] Giá hiện hành được thay bằng command atomic có expected price id/version; amount VAT-included phải lớn hơn 0.
- [x] Storefront/cart chốt theo `variantId`/SKU; hai SKU cùng Product là hai dòng giỏ riêng.
- [x] Variant metadata update dùng expected version; SKU không nằm trong update contract và không thể đổi.
- [x] Product Admin hỗ trợ create/update/detail/lifecycle; danh sách dùng search debounce và server pagination thay vì khóa page đầu.
- [x] Cloudinary finalize verify provider rồi persist `media_assets` idempotent; Product Media attach/update alt/primary/reorder/archive qua generated SDK.
- [x] Revoke assignment giữ row `REVOKED`, ghi `valid_to`, tăng permission version và audit atomic; OWNER assignment không thể revoke.
- [x] Storefront Auth contract được tách theo tag `Storefront Auth`; Client Orval sinh SDK riêng từ `document/api/storefront/auth.yaml`.
- [x] Register chỉ tạo CUSTOMER ACTIVE; login customer/admin tách theo userType và dùng chung identifier email/phone.
- [x] SĐT Việt Nam được validate bằng metadata đầy đủ và lưu E.164; unique constraint PostgreSQL xử lý đăng ký đồng thời.
- [x] Contract writer unit test xác nhận operation `Storefront Auth` chỉ nằm trong `document/api/storefront/auth.yaml`; API hiện có 17 suites/61 unit tests pass.
- [x] BODY transport ở development giữ sessionStorage; COOKIE transport production giữ refresh token HttpOnly, access token memory; shared fetcher auto attach/rotate và giữ BODY compatibility.
- [x] Development principal của `/admin/auth/me` trả toàn bộ permission OWNER, kể cả route chỉ yêu cầu authentication; Admin FE không còn nhận mảng permission rỗng khi `AUTH_BYPASS=true`.
- [x] Production guard trả qua sau khi xác minh token đối với endpoint authentication-only; không gọi `.every()` trên permission metadata `undefined`. Regression test cover `/admin/auth/me` với `mustChangePassword=true`.
- [x] Sai password lần 5 auto-lock atomic, revoke session và audit; staff mới/unlock phải đổi mật khẩu mặc định.
- [x] Audit Admin dùng cursor pagination, GLOBAL owner scope và recursive redaction; không expose IP/user-agent hash.
- [x] Price Admin quản lý current/upcoming/history, future schedule, no-retroactive và >20% reason/confirm.
- [x] HTTP e2e với fresh PostgreSQL local và `AUTH_BYPASS=false`: 2 suites, 11/11 test; gồm revoke assignment, variant/media, price lifecycle và inventory adjustment persist/replay/conflict/audit.
- [x] PostgreSQL integration: 3 suites, 21/21 test; fresh 9/9 migration và seed demo chạy lặp hai lần.
- [x] Sáu operation HTTP DELETE logic đã xuất vào OpenAPI/YAML và Admin Orval SDK; controller regression xác nhận tái sử dụng đúng lifecycle/invariant/audit service.
- [x] Ba operation DELETE mở rộng cho post/review/staff đã xuất từ NestJS và ghép vào Admin bằng Orval hooks; staff giữ PostgreSQL lifecycle, CMS/Review vẫn là in-memory P1.
- [ ] Verified identity/token — development đang dùng `AUTH_BYPASS=true` và principal OWNER bootstrap; production bắt buộc tắt bypass.
- [ ] PostgreSQL permission/scope + transaction/audit integration — blocker trước staging.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-04 | Chuẩn hóa metadata; chốt một Admin gốc, lockout, trim input Auth và cách hiển thị lỗi Admin. | DBAPI-20260904-SINGLE-ROOT-ADMIN |
| 1.1.0 | 2026-09-05 | Bổ sung sáu HTTP DELETE logic, giữ route lifecycle cũ và regenerate OpenAPI/Admin SDK. | API-20260905-LOGICAL-DELETE-V1 |
| 1.2.0 | 2026-09-05 | Mở rộng DELETE logic cho content post, review và staff; generated SDK được ghép vào ba màn Admin. | API-20260905-ADMIN-DELETE-EXTENSION |
| 1.2.1 | 2026-09-05 | Đồng bộ development OWNER permissions qua `/admin/auth/me`; production guard không thay đổi. | API-20260905-DEV-OWNER-PERMISSIONS |
| 1.2.2 | 2026-09-06 | Sửa production authentication-only guard gây `/admin/auth/me` 500 sau khi login thành công. | API-20260906-AUTH-ME-GUARD-FIX |
