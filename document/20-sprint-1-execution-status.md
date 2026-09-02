# Sprint 1 execution status

Ngày cập nhật: 2026-09-01

## Kết luận

Sprint 1 hiện đạt khoảng **86% functional scope** và **78% Definition of Done** sau khi kéo Customer register/login vào scope. Foundation, staff/customer authentication core, fixed-role RBAC, persisted Organization/IAM, staff provisioning + lock/unlock/revoke-session, audit atomicity, Catalog CRUD/lifecycle core và contract/codegen chain đã chạy thật. Sprint chưa được đánh dấu DONE vì customer auth chưa có DB e2e rerun/secure protected-API transport, audit query, variant update, media attach/reorder, price management lifecycle và bắt buộc đổi mật khẩu lần đầu chưa hoàn chỉnh.

Hai tỷ lệ không được tính theo số file hoặc số endpoint:

- **Functional scope 86/100**: chức năng người dùng thực hiện được so với phạm vi Sprint 1 đã khóa.
- **Definition of Done 78/100**: mức hoàn thiện kỹ thuật gồm validation, authorization, transaction, test PostgreSQL/HTTP, UI states, migration, audit, tài liệu và QA acceptance.

## Bảng điểm có trọng số

### Functional scope — 86/100

| Nhóm | Trọng số | Điểm đạt | Evidence chính | Phần còn thiếu |
| --- | ---: | ---: | --- | --- |
| Foundation/platform | 15 | **15** | Config validation, DB/migration/seed, error envelope, request-id, audit writer, CI foundation, OpenAPI V1 | Production readiness được tính trong DoD |
| IAM/RBAC | 25 | **21** | Customer register/login email-phone; staff auth; fixed roles; create/assign; branch scope; lock/unlock/revoke session; audit | DB e2e rerun, secure customer protected-API transport, revoke assignment, audit query, forced password change, full scope matrix |
| Catalog/Pricing/Media | 40 | **32** | Brand/category CRUD; product CRUD + lifecycle; variant create/lifecycle; combo; effective price; storefront filter | Variant metadata update, media attach/reorder/alt-text, price lifecycle UI/test |
| Admin/Storefront/contract | 20 | **18** | Admin screens, generated Orval SDK, canonical errors, Catalog storefront, PWA base | Media workflow, một số edit-field coverage và UI acceptance evidence |
| **Tổng** | **100** | **86** |  |  |

### Definition of Done — 78/100

| Nhóm DoD | Trọng số | Điểm đạt | Lý do chưa đủ điểm |
| --- | ---: | ---: | --- |
| Backend implementation + validation | 25 | **24** | Còn audit query và media/lifecycle API |
| Authorization + transaction + concurrency | 20 | **17** | Thiếu full permission/scope HTTP matrix và least-privilege DB evidence |
| Frontend happy/error/loading/empty/disabled | 15 | **13** | Flow media/price/variant chưa đủ UI state/acceptance |
| Unit + integration + HTTP tests | 20 | **12** | Unit xanh; lifecycle e2e mới chưa rerun do DB URL placeholder |
| Migration + seed + audit + contract docs | 10 | **8** | Thiếu production DB role và backup/restore evidence |
| BA acceptance + QA regression + release evidence | 10 | **4** | Chưa có BA sign-off, full regression và evidence environment chung |
| **Tổng** | **100** | **78** |  |

## Evidence nền đã đạt trước lần rà soát này

- [x] 6 migration versioned; PostgreSQL local xác nhận schema up to date và `20260829233000_remove_deleted_at_v1` đã apply; không dùng runtime DDL.
- [x] Seed hội tụ chạy thành công hai lần liên tiếp.
- [x] API unit 49/49; Prisma validate; production build.
- [x] PostgreSQL integration: 18/18 tests.
- [x] HTTP e2e: 7/7 tests, gồm staff login bằng credential mặc định và Catalog archive/reactivate.
- [x] Admin: lint; 12/12 tests; production build; chunk Products 16.64 kB, core 489.47 kB.
- [x] Storefront: typecheck; 3/3 tests; Next.js production build; PWA manifest route.
- [x] OpenAPI producer JSON và consumer YAML cùng sinh từ NestJS.
- [x] Admin/client SDK được regenerate bằng Orval; generated code không sửa tay.
- [x] GitNexus re-index: 4.543 nodes, 8.166 edges, 174 clusters, 223 flows.

Evidence rà soát lại ngày 2026-09-01:

- [x] PostgreSQL local `localhost:55432`: 6/6 migration applied; truy vấn `information_schema.columns` trả **0 cột `deleted_at`** trong schema `public`.
- [x] Migration from-zero đã được chạy trên database tạm `dctd_deleted_at_verify_20260901`: đủ 6 migration apply thành công, còn 0 cột `deleted_at`; database test đã được xóa sau kiểm tra.
- [x] API: 17 test suites, **61/61 tests**; lint/build/Prisma validate pass.
- [x] Admin: 7 test files, **12/12 tests**; lint pass.
- [x] Client: 3 test files, **3/3 tests**; TypeScript check pass.
- [x] GitNexus sau re-index: **4.766 nodes, 8.711 edges, 188 clusters, 202 flows**.
- [~] GitNexus cảnh báo process discovery bị truncate **257/457 entry-point candidates** và bỏ qua 33 callees theo branching cap; số flow dùng để điều hướng/review, không dùng làm bằng chứng duy nhất rằng mọi luồng đã được test.
- [~] `detect_changes --scope compare --base-ref HEAD^` cho commit Customer Auth: **49 files, 164 symbols, 19 affected flows, risk CRITICAL**. Mức này phản ánh blast radius xuyên BE/OpenAPI/Admin/Storefront; phải khép HTTP e2e và QA auth regression trước khi coi an toàn để release.
- [ ] PostgreSQL integration/HTTP e2e đã được gọi lại nhưng **0/9 case khởi tạo được ứng dụng** vì `.env.local` trỏ `aws-0-region.pooler.supabase.com`; đây là placeholder không thể kết nối, không được tính là test pass.
- [x] E2E teardown đã được guard khi application bootstrap thất bại, tránh lỗi `app.close()` che nguyên nhân kết nối DB.

## Checklist chi tiết

Ký hiệu: `[x]` hoàn thành theo evidence hiện có; `[~]` đã có core nhưng chưa đủ DoD; `[ ]` chưa làm.

### Foundation/platform

- [x] `/health` và trạng thái database.
- [x] Env validation fail-fast.
- [x] Migration và seed framework; không runtime DDL.
- [x] Error response thống nhất `code/message/details/requestId/path/method/timestamp`.
- [x] Request correlation và structured logging có redaction credential.
- [x] Audit writer transaction-bound và append-only hardening.
- [x] API prefix `/api/v1`, Swagger/OpenAPI JSON/YAML.
- [x] Admin/Client SDK generate từ OpenAPI; không sửa generated code bằng tay.
- [~] CI gate có code/config, cần evidence lại trên environment chung.

### IAM/RBAC

- [x] Public register chỉ tạo CUSTOMER ACTIVE và yêu cầu ít nhất email hoặc SĐT.
- [x] Customer/Staff login nhận một `identifier`, tách userType để không đăng nhập chéo luồng.
- [x] Email trim/lowercase; SĐT Việt Nam validate metadata đầy đủ và lưu E.164.
- [x] Unique email/phone constraint xử lý race; register tạo user + audit GUEST + session atomic.
- [x] Storefront `/register` và `/login` dùng generated Auth SDK, có loading/error/disabled states.
- [~] V1 dev tạm bỏ email/phone verification theo D38.
- [~] Token lưu sessionStorage; auto attach/refresh protected customer API chưa làm vì shared fetcher có impact HIGH.
- [x] Staff login, refresh rotation, logout; access token kiểm tra session/permissionVersion.
- [x] Ba role V1: `OWNER`, `BRANCH_MANAGER`, `STAFF`.
- [x] Tạo staff ACTIVE bằng email và mật khẩu mặc định `Aa@123456`.
- [x] Gán role GLOBAL/BRANCH; duplicate đồng thời trả một `201`, một `409`.
- [x] OWNER quản lý BRANCH_MANAGER/STAFF; không lock/unlock OWNER.
- [x] Branch Manager chỉ quản lý STAFF trong branch được gán.
- [x] Lock yêu cầu lý do, chuyển ACTIVE→LOCKED và revoke toàn bộ session atomic.
- [x] Unlock chuyển LOCKED→ACTIVE, reset Argon2 password và không phục hồi session cũ.
- [x] Create/assign/lock/unlock ghi audit cùng transaction.
- [~] Lifecycle/scope có unit test; HTTP e2e đã viết nhưng chưa rerun với DB thật.
- [ ] API revoke role assignment.
- [ ] API/màn hình list-filter audit có redaction.
- [ ] Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
- [ ] Full permission + GLOBAL/BRANCH HTTP test matrix.

### Catalog/Pricing/Media

- [x] Brand create/list/update/active-search/activate/deactivate, optimistic version và audit.
- [x] Category create/list/update/search/activate/deactivate; parent immutable trong V1.
- [x] Product create/list/detail/update/publish/archive/reactivate-to-DRAFT.
- [x] Variant create/archive/reactivate; SKU/barcode constraints.
- [x] Fixed combo create/lifecycle; không nested; quantity > 0.
- [x] Effective VAT-included price dùng Decimal(19,2), có no-overlap constraint.
- [x] Storefront chỉ trả product PUBLISHED, variant ACTIVE và giá effective.
- [~] Admin Product workflow đã ghép generated hooks nhưng edit field coverage chưa đầy đủ.
- [ ] Update metadata variant.
- [ ] Media finalize verification + attach/reorder/alt-text API và Admin UI.
- [ ] Price close/schedule UI và explicit concurrent-overlap HTTP test.
- [ ] Update bundle items và preview availability theo component.

### Admin/Storefront

- [x] Admin sidebar/header/menu và management page base.
- [x] IAM list/create/assign/lock/unlock UI.
- [x] Branch + một warehouse CRUD/lifecycle UI.
- [x] Brand/category/product/variant/combo core UI.
- [x] CKEditor4 và Cloudinary adapter/base upload flow.
- [x] Axios canonical fetcher/error mapping; loading/error patterns.
- [x] Storefront Next.js và PWA base; Catalog list/detail generated API.
- [~] UI states có ở flow chính, chưa có QA matrix toàn bộ màn.
- [ ] Media library và product media reorder UI.
- [ ] Hoàn thiện price scheduling UI.

### Trước khi chốt Sprint 1 DONE

- [ ] Khôi phục DB URL dev/staging hợp lệ mà không commit secret.
- [ ] Chạy migration from-zero, seed hai lần, PostgreSQL integration và HTTP e2e lifecycle mới.
- [ ] Chạy full permission/branch-scope regression.
- [ ] Hoàn thiện Variant update, Product Media và Price lifecycle trong Sprint 1.
- [ ] Chốt hoặc chuyển scope có Decision Log cho audit query/revoke assignment/forced password change.
- [ ] BA acceptance và QA regression trên environment chung.
- [ ] Không còn P0/P1 bug mở.
- [ ] Lưu screenshot/API/test/log evidence và cập nhật Function Matrix.

## Ưu tiên để tăng tỷ lệ

1. **DB/e2e evidence**: có thể nâng DoD khoảng 3–5 điểm.
2. **Variant update + Media workflow**: khoảng 4–5 điểm functional và 3–4 điểm DoD.
3. **Audit query + revoke assignment + permission matrix**: khoảng 3 điểm functional và 3 điểm DoD.
4. **Price lifecycle UI + QA/BA acceptance**: khoảng 2 điểm functional và 5–7 điểm DoD.

## Function checklist

| ID | Trạng thái | Đã có | Còn thiếu để DONE |
| --- | --- | --- | --- |
| IAM-01 Customer auth | DONE-CORE | Register CUSTOMER ACTIVE; email/phone identifier; E.164; Argon2; session/audit atomic; Storefront login/register generated SDK | DB e2e rerun; verification; protected-API auto attach/refresh; forgot password nằm IAM-02 |
| IAM-03 Staff lifecycle | DONE-CORE | Tạo ACTIVE staff bằng email + Argon2 default password; lock revoke all sessions; unlock reset password; OWNER/Branch scope; audit atomic | Bắt buộc đổi mật khẩu lần đầu và HTTP e2e cần chạy lại khi DB env thật hoạt động |
| IAM-04 Fixed RBAC | DONE-CORE | 3 system roles; deny unknown; no create-role API; seed hội tụ | Test matrix toàn permission catalog |
| IAM-05 Assignment scope | DONE-CORE | GLOBAL/BRANCH; duplicate 201/409; permissionVersion atomic; audit | API revoke assignment; thêm e2e Branch Manager cross-branch deny |
| IAM-06 Audit | DONE-WRITE | Append-only UPDATE/DELETE/TRUNCATE; actor constraint; transaction rollback | API list/filter/redaction và màn admin audit |
| CAT-01 Brand | DONE-CORE | Persisted create/list/update/active-search/activate/deactivate; optimistic version; audit; admin screen | Logo asset workflow độc lập |
| CAT-02 Category | DONE-V1-CORE | Persisted create/list/update/search/activate/deactivate; parent immutable; chặn tắt cha còn con active | Move subtree đã chốt P1; tiếp tục in-use test matrix |
| CAT-03 Product SPU | DONE-CORE | Create/list/detail/update/publish/archive/reactivate-to-DRAFT; version conflict; audit; admin actions | Hoàn thiện edit UI field coverage |
| CAT-04 Variant/SKU | PARTIAL | Persisted create/archive/reactivate; SKU/barcode constraints; optimistic version; combo component protection; admin actions | Update mutable fields và integration matrix đầy đủ |
| CAT-05 Product media | PARTIAL | Tables, provider metadata, ownership/primary constraints | Finalize provider verification, attach/reorder/alt-text APIs và admin UI |
| CAT-07 Storefront catalog | DONE-CORE | Chỉ PUBLISHED + ACTIVE variant + effective price; slug detail/list | Brand/price filter, sort và SEO detail page |
| CAT-12 Fixed combo | DONE-LIFECYCLE-CORE | Persisted create; no nested; quantity > 0; combo archive/reactivate qua Product; admin confirmation | Update bundle items và preview availability theo thành phần |
| PRI-01 Effective price | DONE-CORE | Decimal(19,2), VAT-included global price, no-overlap DB constraint, audit | Close/schedule management UI và explicit overlap HTTP test |

## RBAC V1 đã áp dụng

- `OWNER`: scope GLOBAL, toàn quyền mọi branch; có thể có nhiều OWNER.
- `BRANCH_MANAGER`: chỉ xem nhân sự thuộc branch được gán; chỉ được gán role STAFF vào chính branch đó; không quản lý global Catalog/price/role/branch.
- `STAFF`: nghiệp vụ vận hành trong branch; không có quyền IAM management.
- Backend lấy permission và scope từ assignment đang ACTIVE trong PostgreSQL; header `x-permissions` giả bị trả 401.

## Quyết định Product đã chốt

1. Staff được tạo bằng email với mật khẩu mặc định `Aa@123456`, không gửi invite link (D35).
2. Product/combo archive ẩn storefront ngay, giữ snapshot đơn lịch sử; reactivate về DRAFT (D36).
3. Category move không thuộc Sprint 1, chuyển sang P1; `parent_id` bất biến khi update V1 (D37).
4. Lock chỉ nhận user ACTIVE và yêu cầu lý do; unlock chỉ nhận user LOCKED, không phục hồi session cũ và reset password về `Aa@123456`.
5. OWNER không được lock/unlock bất kỳ OWNER nào; Branch Manager chỉ lock/unlock STAFF trong branch được gán.
6. Public register chỉ tạo CUSTOMER ACTIVE; tạm bỏ verification. Login dùng email hoặc SĐT Việt Nam đã chuẩn hóa E.164 (D38).

## Blocker môi trường

- `api/.env.local` được git-ignore và không bị track, nhưng DB host/tenant vẫn là placeholder `aws-0-region.pooler.supabase.com`. Lần chạy `test:e2e` ngày 2026-09-01 xác nhận Prisma không thể kết nối; cần thay bằng pooler host thật nhưng không được commit/in log credential.
- OpenAPI đã sinh thành công với `DATABASE_ENABLED=false`; HTTP e2e có **2 suites/9 cases** nhưng chưa có case nào chạy qua bootstrap vì blocker DB trên.
- Runtime least-privilege DB role/RLS policy chưa được chốt; hiện migration owner có thể bypass RLS. Không được coi là production-ready cho đến khi có non-owner test.
