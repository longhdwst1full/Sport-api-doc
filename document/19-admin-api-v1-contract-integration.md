# Admin và Storefront API v1 contract integration

Ngày cập nhật: 2026-09-01

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
| Search branch active | `GET /api/v1/admin/organization/branches/active` | `searchActiveAdminBranches` | `org.branch.view` | Gán role scope BRANCH |
| Search warehouse active | `GET /api/v1/admin/organization/warehouses/active` | `searchActiveAdminWarehouses` | `org.warehouse.view` | Gán role scope WAREHOUSE |
| Danh sách role quản trị | `GET /api/v1/admin/iam/roles` | `listAdminRoles` | `iam.role.view` | Tab Role |
| Search role active | `GET /api/v1/admin/iam/roles/active` | `searchActiveAdminRoles` | `iam.role.view` | Gán role cho user |
| Gán role | `POST /api/v1/admin/iam/users/{userId}/role-assignments` | `assignAdminUserRole` | `iam.assignment.manage` | Role assignment drawer |
| Tạo staff và gán branch role | `POST /api/v1/admin/iam/users` | `createAdminStaffUser` | `iam.user.manage` | Staff creation drawer |
| CRUD lifecycle brand | `GET/POST/PATCH` + `POST .../{id}/activate|deactivate` | `list/create/update/activate/deactivateAdminBrand` | `catalog.brand.view/manage` | Catalog master page |
| CRUD lifecycle category | `GET/POST/PATCH` + `POST .../{id}/activate|deactivate` | `list/create/update/activate/deactivateAdminCategory` | `catalog.category.view/manage` | Catalog master page |
| Điều chỉnh kho | `POST /api/v1/admin/inventory/adjustments` | `createStockAdjustment` | `inventory.stock.adjust` | Inventory drawer; generated request option truyền Idempotency-Key |
| Kiểm duyệt đánh giá | `PATCH /api/v1/admin/reviews/{id}/moderation` | `moderateAdminReview` | `review.moderate` | Reviews actions |
| Archive/reactivate product hoặc combo | `POST .../products/{id}/archive|reactivate` | `archiveAdminProduct` / `reactivateAdminProduct` | `catalog.product.publish` | Product workflow drawer |
| Archive/reactivate variant | `POST .../products/variants/{id}/archive|reactivate` | `archiveAdminProductVariant` / `reactivateAdminProductVariant` | `catalog.product.manage` | Product workflow drawer |
| Customer register | `POST /api/v1/auth/register` | `registerCustomer` | Public + rate limit | Storefront `/register` |
| Customer login email/phone | `POST /api/v1/auth/login` | `loginCustomer` | Public + rate limit | Storefront `/login` |
| Customer refresh/logout/me | `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | `refreshCustomerToken`, `logoutCustomer`, `getCustomerCurrentUser` | Token/session | Generated Storefront Auth SDK |
| Staff login email/phone | `POST /api/v1/admin/auth/login` | `loginAdmin` | Public + rate limit; chỉ userType STAFF | Admin Login |

API `/active` nhận `search`, `page`, `limit`; warehouse nhận thêm `branchId`. Response thống nhất:

```json
{
  "items": [{ "id": "uuid", "code": "CODE", "label": "Display label" }],
  "meta": { "page": 1, "limit": 20, "total": 1, "hasMore": false }
}
```

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

- [x] OpenAPI có đúng ba operation `searchActiveAdminBranches`, `searchActiveAdminWarehouses`, `searchActiveAdminRoles`.
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
- [x] Product/combo/variant lifecycle dùng named actions và optimistic version; storefront không trả archived/inactive data.
- [x] Storefront Auth contract được tách theo tag `Storefront Auth`; Client Orval sinh SDK riêng từ `document/api/storefront/auth.yaml`.
- [x] Register chỉ tạo CUSTOMER ACTIVE; login customer/admin tách theo userType và dùng chung identifier email/phone.
- [x] SĐT Việt Nam được validate bằng metadata đầy đủ và lưu E.164; unique constraint PostgreSQL xử lý đăng ký đồng thời.
- [~] Client lưu token trong sessionStorage sau login/register; chưa sửa shared fetcher HIGH-risk để auto attach/refresh protected API.
- [ ] Verified identity/token — development đang dùng `AUTH_BYPASS=true` và principal OWNER bootstrap; production bắt buộc tắt bypass.
- [ ] PostgreSQL permission/scope + transaction/audit integration — blocker trước staging.
