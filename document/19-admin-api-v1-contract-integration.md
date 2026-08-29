# Admin API v1 contract integration

Ngày cập nhật: 2026-08-29

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
| Search branch active | `GET /api/v1/admin/organization/branches/active` | `searchActiveAdminBranches` | `org.branch.view` | Gán role scope BRANCH |
| Search warehouse active | `GET /api/v1/admin/organization/warehouses/active` | `searchActiveAdminWarehouses` | `org.warehouse.view` | Gán role scope WAREHOUSE |
| Danh sách role quản trị | `GET /api/v1/admin/iam/roles` | `listAdminRoles` | `iam.role.view` | Tab Role |
| Search role active | `GET /api/v1/admin/iam/roles/active` | `searchActiveAdminRoles` | `iam.role.view` | Gán role cho user |
| Gán role | `POST /api/v1/admin/iam/users/{userId}/role-assignments` | `assignAdminUserRole` | `iam.assignment.manage` | Role assignment drawer |

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
- [ ] Persisted IAM/Organization adapter — hiện endpoint vẫn dùng in-memory repository.
- [ ] Verified identity/token — `x-permissions` vẫn chỉ là development scaffold.
- [ ] PostgreSQL permission/scope + transaction/audit integration — blocker trước staging.
