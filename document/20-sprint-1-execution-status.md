# Sprint 1 execution status

Ngày cập nhật: 2026-08-29

## Kết luận

Sprint 1 hiện đạt khoảng **70% functional scope** và **62% Definition of Done**. Foundation, verified staff authentication, fixed-role RBAC, persisted Organization/IAM, audit atomicity, Catalog core và contract/codegen chain đã chạy thật. Sprint chưa được đánh dấu DONE vì staff lifecycle, audit query, các transition archive, media finalize/attach và một số màn master-data chưa hoàn chỉnh.

## Evidence đã đạt

- [x] 5 migration versioned đã apply trên Supabase; không dùng runtime DDL.
- [x] Seed hội tụ chạy thành công hai lần liên tiếp.
- [x] API lint; 30/30 unit tests; Prisma validate; production build.
- [x] PostgreSQL integration: 18/18 tests.
- [x] HTTP e2e: 5/5 tests.
- [x] Admin: lint; 9/9 tests; production build; chunk Products 16.82 kB.
- [x] Storefront: typecheck; 3/3 tests; Next.js production build; PWA manifest route.
- [x] OpenAPI producer JSON và consumer YAML cùng sinh từ NestJS.
- [x] Admin/client SDK được regenerate bằng Orval; generated code không sửa tay.
- [x] GitNexus re-index: 3,793 nodes, 6,610 edges, 185 flows.

## Function checklist

| ID | Trạng thái | Đã có | Còn thiếu để DONE |
| --- | --- | --- | --- |
| IAM-03 Staff lifecycle | BLOCKED-DECISION | User/role/session schema, login/logout/refresh | Chọn invite activation; create/invite, lock/unlock, revoke session; bảo vệ OWNER cuối |
| IAM-04 Fixed RBAC | DONE-CORE | 3 system roles; deny unknown; no create-role API; seed hội tụ | Test matrix toàn permission catalog |
| IAM-05 Assignment scope | DONE-CORE | GLOBAL/BRANCH; duplicate 201/409; permissionVersion atomic; audit | API revoke assignment; thêm e2e Branch Manager cross-branch deny |
| IAM-06 Audit | DONE-WRITE | Append-only UPDATE/DELETE/TRUNCATE; actor constraint; transaction rollback | API list/filter/redaction và màn admin audit |
| CAT-01 Brand | PARTIAL | Persisted create/list/active-search; unique code/slug; audit | Update/archive, logo asset, admin master-data screen |
| CAT-02 Category | PARTIAL | Persisted tree create/list/search; path/depth; self-parent test | Move/archive, descendant cycle, in-use protection, admin tree screen |
| CAT-03 Product SPU | DONE-CORE | Create/list/detail/update/publish; version conflict 200/409; audit | ARCHIVED transition và edit UI |
| CAT-04 Variant/SKU | PARTIAL | Persisted create; SKU/barcode constraints; admin create UI | Update/archive/status transition và tests |
| CAT-05 Product media | PARTIAL | Tables, provider metadata, ownership/primary constraints | Finalize provider verification, attach/reorder/alt-text APIs và admin UI |
| CAT-07 Storefront catalog | DONE-CORE | Chỉ PUBLISHED + ACTIVE variant + effective price; slug detail/list | Brand/price filter, sort và SEO detail page |
| CAT-12 Fixed combo | DONE-API-CORE | Persisted create; no nested; quantity > 0; integration tests | Update/archive/preview availability và admin UI |
| PRI-01 Effective price | DONE-CORE | Decimal(19,2), VAT-included global price, no-overlap DB constraint, audit | Close/schedule management UI và explicit overlap HTTP test |

## RBAC V1 đã áp dụng

- `OWNER`: scope GLOBAL, toàn quyền mọi branch; có thể có nhiều OWNER.
- `BRANCH_MANAGER`: chỉ xem nhân sự thuộc branch được gán; chỉ được gán role STAFF vào chính branch đó; không quản lý global Catalog/price/role/branch.
- `STAFF`: nghiệp vụ vận hành trong branch; không có quyền IAM management.
- Backend lấy permission và scope từ assignment đang ACTIVE trong PostgreSQL; header `x-permissions` giả bị trả 401.

## Blocker cần Product xác nhận

1. Staff activation: gửi email link/token một lần hay OWNER đặt mật khẩu tạm?
2. Khi archive một sản phẩm đã PUBLISHED, storefront ẩn ngay nhưng đơn lịch sử vẫn giữ snapshot — xác nhận đây là hành vi mong muốn.
3. Category move V1 có thực sự bắt buộc trong Sprint 1 hay chỉ create/archive và dời move sang P1?

## Blocker môi trường

- `api/.env.local` được git-ignore và không bị track, nhưng phần DB host/tenant vẫn đang là placeholder. Evidence Supabase ở trên được chạy bằng cấu hình đúng chỉ inject trong process để không in/commit secret. Cần sửa local env trước khi dùng các script thông thường.
- Runtime least-privilege DB role/RLS policy chưa được chốt; hiện migration owner có thể bypass RLS. Không được coi là production-ready cho đến khi có non-owner test.
