# Backend review và kế hoạch Sprint 1

Ngày rà soát: 2026-08-29  
Phạm vi: `api/`, Organization, IAM và platform foundation.

## 1. Kết luận nhanh

Backend hiện là NestJS modular monolith có OpenAPI, validation, permission guard và ranh giới module tương đối rõ. Catalog, Inventory, CMS và Review đã có vertical slice in-memory. Organization và IAM trước Sprint 1 mới chỉ là module rỗng.

Nền hiện tại phù hợp để phát triển tiếp, nhưng chưa được xem là production-ready vì chưa có PostgreSQL adapter/migration, verified identity, durable audit, idempotency store, outbox và integration test trên database thật.

## 2. Source tham khảo và khả năng tái sử dụng

Không tìm thấy một repository riêng tên `dctc-service` hoặc `dctd-service` dưới `/home/longhd`. Các source liên quan hiện có là:

- `dctd-utc/api`: nguồn backend chính cần tiếp tục.
- `identity-service`: tham khảo repository port, role/permission mapping, cache invalidation và audit/version.
- `customer-service`: tham khảo module/application/infrastructure boundary.
- `stonehub-bff`: tham khảo logging, request context và vận hành service; không copy domain tài chính.
- `saletools-ulrp-presentation`: chỉ tham khảo flow/UI, không phải backend commerce source.

Phần có thể tận dụng nhanh ở mức pattern:

- Role là bundle permission; user nhận role thông qua assignment có data scope.
- Permission code là mã nghiệp vụ ổn định, không suy ra từ URL.
- Application service đứng giữa controller và repository/adapter.
- `permission_version` tăng sau khi assignment thay đổi để chuẩn bị invalidation cache.
- Request ID, structured log và che token/PII trong log.

Phần không copy nguyên trạng:

- Entity/repository Quarkus hoặc DTO tài chính từ các service cũ.
- Maker-checker tổng quát cho mọi CRUD.
- Quyền hai mức hoặc quyền gắn trực tiếp với route frontend.
- Schema/migration khi UUID strategy, soft-delete và retention vẫn chưa `DECIDED`.

## 3. Đánh giá backend hiện tại

### Điểm tốt

- Module ownership đã bám theo 74 bảng review và delivery wave.
- Controller active có operation ID, Swagger DTO và class-validator.
- Permission guard dùng stable business code và API là nguồn quyết định cuối.
- In-memory inventory đã minh họa idempotency và invariant không thấp hơn reserved.
- OpenAPI là contract producer cho client/admin generate SDK.

### Khoảng trống cần xử lý

| Mức | Khoảng trống                                      | Hướng xử lý                                                               |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| P0  | `x-permissions` và `AUTH_BYPASS` chỉ là scaffold  | JWT/session verified identity và deny-by-default trước staging production |
| P0  | Chưa có persistence adapter/migration             | Chốt D19, D20, D22, D23 rồi triển khai PostgreSQL theo wave               |
| P0  | Chưa có durable audit/outbox/idempotency          | Bổ sung sau khi transaction boundary và schema được duyệt                 |
| P0  | Chưa có integration/e2e PostgreSQL                | Tạo test environment và migration smoke test                              |
| P1  | Error code hiện còn suy từ HTTP status            | Chuẩn hóa domain error code theo use case                                 |
| P1  | Một số permission CMS/Review chưa đồng bộ catalog | Sửa backend, admin và CSV trong một contract change riêng                 |

## 4. Sprint 1 đã chọn

Mục tiêu: kích hoạt Organization + IAM ở mức contract/application/domain validation để admin có API thật thay fixture trong bước kế tiếp.

### Chức năng

- Danh sách chi nhánh.
- Danh sách kho.
- Tạo chi nhánh cùng đúng một kho primary trong một command.
- Danh sách staff user, role và stable permission code.
- Tạo role từ permission đã biết; unknown permission bị từ chối.
- Gán role cho user theo `GLOBAL`, `BRANCH`, `WAREHOUSE`, `OWN`.
- Scope sai identifier hoặc resource không active bị fail closed.
- Tăng `permissionVersion` sau assignment.

### API contract

| Method | Path                                                | Permission                                   |
| ------ | --------------------------------------------------- | -------------------------------------------- |
| GET    | `/api/v1/admin/organization/branches`               | `org.branch.view`                            |
| GET    | `/api/v1/admin/organization/warehouses`             | `org.warehouse.view`                         |
| POST   | `/api/v1/admin/organization/branches`               | `org.branch.manage` + `org.warehouse.manage` |
| GET    | `/api/v1/admin/iam/users`                           | `iam.user.view`                              |
| GET    | `/api/v1/admin/iam/roles`                           | `iam.role.view`                              |
| GET    | `/api/v1/admin/iam/permissions`                     | `iam.role.view`                              |
| POST   | `/api/v1/admin/iam/roles`                           | `iam.role.manage`                            |
| POST   | `/api/v1/admin/iam/users/{userId}/role-assignments` | `iam.assignment.manage`                      |

## 5. Backend foundation thêm trong Sprint 1

- `nestjs-pino`, `pino`, `pino-http`: structured request log, request ID và redaction các header/body nhạy cảm.
- `@nestjs/throttler`: global rate limit mặc định 120 request/60 giây, cấu hình qua environment.
- Không cài TypeORM/Prisma trong sprint này vì persistence decisions chưa được chốt.

## 6. Checklist Sprint 1

### Foundation

- [x] Dependency được khai báo trong `@dctd/api`, không cài application package ở root.
- [x] Structured logging có request ID.
- [x] Redact authorization, cookie, password và refresh token.
- [x] Global rate limit có environment override.
- [ ] Chốt proxy/trusted IP policy trước khi dùng rate limit sau ingress.

### Organization

- [x] Active module và OpenAPI tag riêng.
- [x] Read branch/warehouse tách theo permission.
- [x] Create branch + one primary warehouse.
- [x] Duplicate business code bị conflict.
- [x] Unit test invariant 1 branch : 1 warehouse.
- [ ] PostgreSQL unique constraint và transaction integration test sau khi chốt migration.

### IAM

- [x] Read user/role/permission.
- [x] Create role chỉ từ stable permission catalog.
- [x] Assignment validate scope fail-closed.
- [x] Duplicate assignment bị conflict.
- [x] `permissionVersion` tăng khi assignment thay đổi.
- [ ] Sensitive permission assignment approval sau khi policy được chốt.
- [ ] JWT/session, password hashing và refresh rotation chưa thuộc slice này.

### Quality gate

- [x] API lint.
- [x] API Jest: 11/11 test pass.
- [x] OpenAPI generate và kiểm tra 8 operation trên 6 path Sprint 1.
- [x] API production build.
- [x] HTTP smoke: list branch, list role và create branch + warehouse trả 2xx.
- [x] Admin generated SDK, lint, 6/6 test và production build.
- [x] GitNexus detect changes: 23 files, 56 symbols, 12 execution flows; mức rủi ro tổng thể `HIGH` do thay đổi các điểm trung tâm `AdminLayout`, `AppRoutes` và `createApplication`.

## 7. Không nằm trong Sprint 1

- Production login/JWT/refresh session.
- PostgreSQL entities/migrations và Redis permission cache.
- Audit log bền vững, outbox và approval workflow.
- Customer, order, payment và inventory transaction thật.
- Nối admin Organization/IAM sang generated SDK; thực hiện sau khi contract Sprint 1 ổn định.

## 8. Điều kiện bắt đầu Sprint 2

1. Chốt D19 retention, D20 RPO/RTO, D22 soft delete và D23 UUID strategy.
2. Chọn ORM/query layer và migration convention.
3. Dựng PostgreSQL integration test trong CI.
4. Thay in-memory Organization/IAM bằng repository port + PostgreSQL adapter mà không đổi API contract.
5. Generate admin SDK và thay fixture ở hai màn `/organization`, `/access`.
