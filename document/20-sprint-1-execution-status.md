# Sprint 1 execution status

Ngày cập nhật: 2026-09-03

## Kết luận

Sprint 1 hiện đạt khoảng **96% functional scope** và **92% Definition of Done**. Foundation, staff/customer authentication core, fixed-role RBAC, persisted Organization/IAM, staff lifecycle, assign/revoke role, Catalog CRUD/lifecycle, variant metadata, Product Media, combo/price hardening và contract/codegen chain đã chạy thật. Sprint chưa được đánh dấu DONE vì secure protected-API transport, audit query, price scheduling/history UI, bắt buộc đổi mật khẩu lần đầu và full permission matrix chưa hoàn chỉnh; BA/QA trên environment chung cũng chưa ký nhận.

Hai tỷ lệ không được tính theo số file hoặc số endpoint:

- **Functional scope 96/100**: chức năng người dùng thực hiện được so với phạm vi Sprint 1 đã khóa.
- **Definition of Done 92/100**: mức hoàn thiện kỹ thuật gồm validation, authorization, transaction, test PostgreSQL/HTTP, UI states, migration, audit, tài liệu và QA acceptance.

## Bảng điểm có trọng số

### Functional scope — 96/100

| Nhóm | Trọng số | Điểm đạt | Evidence chính | Phần còn thiếu |
| --- | ---: | ---: | --- | --- |
| Foundation/platform | 15 | **15** | Config validation, DB/migration/seed, error envelope, request-id, audit writer, CI foundation, OpenAPI V1 | Production readiness được tính trong DoD |
| IAM/RBAC | 25 | **23** | Customer register/login email-phone; staff auth; fixed roles; create/assign/revoke; branch scope; lock/unlock/revoke session; audit | Secure customer protected-API transport, audit query, forced password change, full scope matrix |
| Catalog/Pricing/Media | 40 | **39** | Brand/category CRUD; product CRUD + lifecycle; variant update/lifecycle; persisted media attach/update/reorder/archive; combo builder; atomic replace price; storefront sellability/detail | Price scheduling/history UI |
| Admin/Storefront/contract | 20 | **19** | Generated Orval SDK; Variant drawer; Product Media panel; IAM revoke modal; canonical errors; Storefront detail + SKU cart/PWA base | QA acceptance evidence toàn màn |
| **Tổng** | **100** | **96** |  |  |

### Definition of Done — 92/100

| Nhóm DoD | Trọng số | Điểm đạt | Lý do chưa đủ điểm |
| --- | ---: | ---: | --- |
| Backend implementation + validation | 25 | **24** | Còn audit query và price history management |
| Authorization + transaction + concurrency | 20 | **19** | Revoke/Media optimistic transaction và race e2e đạt; thiếu full permission/scope HTTP matrix và least-privilege DB evidence |
| Frontend happy/error/loading/empty/disabled | 15 | **15** | Variant/Media/IAM revoke đã ghép generated SDK; còn QA acceptance toàn màn |
| Unit + integration + HTTP tests | 20 | **19** | Unit, PostgreSQL integration và full HTTP e2e xanh; còn full permission matrix |
| Migration + seed + audit + contract docs | 10 | **9** | Thiếu production DB role và backup/restore evidence |
| BA acceptance + QA regression + release evidence | 10 | **5** | Chưa có BA sign-off và full regression environment chung |
| **Tổng** | **100** | **92** |  |

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

Evidence bổ sung ngày 2026-09-02:

- [x] Migration from-zero trên database tạm `dctd_verify_20260902`: **7/7 migration**, foundation seed và demo seed pass; database tạm đã được xóa tự động.
- [x] API lint/build/Prisma validate; **17 suites, 63/63 unit tests**.
- [x] PostgreSQL integration: **3 suites, 20/20 tests**.
- [x] HTTP e2e với `AUTH_BYPASS=false`: **2 suites, 10/10 tests**, gồm auth thật, canonical error, active SKU lookup, price replace, storefront projection và combo publish-vs-component-archive concurrency.
- [x] Admin: lint; **8 files, 15/15 tests**; product type, combo builder và atomic replace-price dùng generated SDK.
- [x] Client: lint; **3 files, 4/4 tests**; product detail và cart tách dòng theo `variantId`.
- [x] Lỗi contract lock/unlock được sửa: `ApiOkResponse` và runtime đều trả HTTP 200.
- [x] GitNexus re-index: **4.960 nodes, 9.112 edges, 187 clusters, 198 flows**; `detect-changes` ghi nhận **44 tracked files, 212 symbols, 63 affected flows, risk CRITICAL** do thay đổi xuyên DB/API/OpenAPI/Admin/Storefront.
- [~] Risk CRITICAL đã được khép bằng lint/unit/build, migration-from-zero, PostgreSQL integration và HTTP concurrency e2e; process discovery vẫn bị truncate nên graph không phải bằng chứng kiểm thử duy nhất.

Evidence bổ sung ngày 2026-09-03:

- [x] API unit: **19 suites, 70/70 tests**; bổ sung media finalize persistence/idempotency/concurrency, product-media optimistic version và IAM revoke policy.
- [x] PostgreSQL integration: **3 suites, 20/20 tests**.
- [x] HTTP e2e `AUTH_BYPASS=false`: **2 suites, 10/10 tests**; có revoke assignment, variant metadata update, media attach/update/reorder và audit.
- [x] Admin: **10 files, 18/18 tests**; generated hooks cho Variant/Media/IAM revoke, server error mapping và destructive confirmation.
- [x] OpenAPI producer JSON, consumer YAML và Admin/Client generated SDK được regenerate từ NestJS source.
- [~] Phân vùng `/` từng đầy làm PostgreSQL crash; thư mục tạm `/tmp/dctd-utc-source` đã được di chuyển nguyên vẹn sang `/home/longhd/.tmp-dctd/archived-dctd-utc-source`, sau đó database recovery healthy và e2e pass.

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
- [x] Lifecycle/auth/scope core có unit và HTTP e2e chạy với PostgreSQL thật.
- [x] API/UI revoke role assignment: giữ lịch sử REVOKED, reason + validTo, permissionVersion và audit atomic; chặn OWNER.
- [ ] API/màn hình list-filter audit có redaction.
- [ ] Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.
- [ ] Full permission + GLOBAL/BRANCH HTTP test matrix.

### Catalog/Pricing/Media

- [x] Brand create/list/update/active-search/activate/deactivate, optimistic version và audit.
- [x] Category create/list/update/search/activate/deactivate; parent immutable trong V1.
- [x] Product create/list/detail/update/publish/archive/reactivate-to-DRAFT.
- [x] Variant create/archive/reactivate; SKU/barcode constraints.
- [x] Fixed combo theo từng SKU; product_type STANDARD/BUNDLE không trộn; không nested; quantity > 0; publish kiểm tra toàn bộ component.
- [x] Effective VAT-included price dùng Decimal(19,2), amount > 0, no-overlap và replace open window atomic có optimistic check.
- [x] Storefront chỉ trả product PUBLISHED và variant sellable; SKU INACTIVE không còn làm sai minPrice/response.
- [x] Admin Product workflow đã ghép generated hooks cho product type, SKU, combo nhiều component và replace giá atomic.
- [x] Update metadata variant optimistic version; SKU immutable; Admin drawer map field error.
- [x] Media finalize provider verification + persist idempotent; attach/reorder/alt-text/primary/archive API và Admin UI.
- [x] API + Admin replace giá atomic có optimistic check và test; price scheduling riêng chưa thuộc flow này.
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
- [x] Product media upload/attach/alt/primary/reorder/archive UI; media library dùng lại toàn hệ thống vẫn là MED-02/P1.
- [ ] Hoàn thiện price scheduling UI.

### Trước khi chốt Sprint 1 DONE

- [~] PostgreSQL local hoạt động; Supabase dev/staging vẫn cần pooler host thật mà không commit secret.
- [x] 7 migration applied local, seed demo có 4 product gồm combo, 20 PostgreSQL integration và full 10 HTTP e2e pass.
- [ ] Chạy full permission/branch-scope regression.
- [~] Variant update và Product Media đã hoàn thiện core; còn Price scheduling/history UI.
- [ ] Chốt hoặc chuyển scope có Decision Log cho audit query/forced password change.
- [ ] BA acceptance và QA regression trên environment chung.
- [ ] Không còn P0/P1 bug mở.
- [ ] Lưu screenshot/API/test/log evidence và cập nhật Function Matrix.

## Ưu tiên để tăng tỷ lệ

1. **DB/e2e evidence**: có thể nâng DoD khoảng 3–5 điểm.
2. **Variant update + Media workflow**: khoảng 4–5 điểm functional và 3–4 điểm DoD.
3. **Audit query + permission matrix**: khoảng 2 điểm functional và 3 điểm DoD.
4. **Price lifecycle UI + QA/BA acceptance**: khoảng 2 điểm functional và 5–7 điểm DoD.

## Function checklist

| ID | Trạng thái | Đã có | Còn thiếu để DONE |
| --- | --- | --- | --- |
| IAM-01 Customer auth | DONE-CORE | Register CUSTOMER ACTIVE; email/phone identifier; E.164; Argon2; session/audit atomic; Storefront login/register generated SDK; DB e2e pass | Verification; protected-API auto attach/refresh; forgot password nằm IAM-02 |
| IAM-03 Staff lifecycle | DONE-CORE | Tạo ACTIVE staff bằng email + Argon2 default password; lock revoke all sessions; unlock reset password; OWNER/Branch scope; audit atomic; HTTP e2e pass | Bắt buộc đổi mật khẩu lần đầu |
| IAM-04 Fixed RBAC | DONE-CORE | 3 system roles; deny unknown; no create-role API; seed hội tụ | Test matrix toàn permission catalog |
| IAM-05 Assignment scope | DONE-V1-CORE | GLOBAL/BRANCH; duplicate 201/409; assign/revoke atomic; permissionVersion; audit; OWNER revoke deny | Thêm full e2e Branch Manager cross-branch deny matrix |
| IAM-06 Audit | DONE-WRITE | Append-only UPDATE/DELETE/TRUNCATE; actor constraint; transaction rollback | API list/filter/redaction và màn admin audit |
| CAT-01 Brand | DONE-CORE | Persisted create/list/update/active-search/activate/deactivate; optimistic version; audit; admin screen | Logo asset workflow độc lập |
| CAT-02 Category | DONE-V1-CORE | Persisted create/list/update/search/activate/deactivate; parent immutable; chặn tắt cha còn con active | Move subtree đã chốt P1; tiếp tục in-use test matrix |
| CAT-03 Product SPU | DONE-CORE | Create/list/detail/update/publish/archive/reactivate-to-DRAFT; STANDARD/BUNDLE invariant; aggregate row locking; version conflict; audit; Admin productType generated UI | Một số metadata edit nâng cao |
| CAT-04 Variant/SKU | DONE-V1-CORE | Persisted create/update/archive/reactivate; SKU immutable; barcode/dimension validation; optimistic version; admin drawer | QA acceptance toàn màn |
| CAT-05 Product media | DONE-V1-CORE | Cloudinary verify + persist idempotent; attach/update/reorder/archive; ownership/primary; product version; Admin panel | MED-02 media library/reuse và provider cleanup là P1 |
| CAT-07 Storefront catalog | DONE-CORE | Chỉ PUBLISHED + sellable variant; minPrice loại INACTIVE; category INACTIVE không lọc/hiện; slug detail/list | Brand/price filter, sort và SEO detail page |
| CAT-12 Fixed combo | DONE-LIFECYCLE-CORE | Persisted per variant; no nested; quantity > 0; publish validate component; publish/archive concurrency invariant; response bundle per SKU | Update bundle items và preview stock availability theo thành phần |
| PRI-01 Effective price | DONE-CORE | Decimal(19,2), amount > 0, VAT-included global price, no-overlap, atomic replace + optimistic check, audit; Admin replace UI | Price scheduling/history management UI |

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
7. Product tách rõ STANDARD/BUNDLE, combo gắn theo từng variant và storefront dùng một sellability predicate thống nhất (D39).
8. Giá REGULAR phải > 0; thay giá đóng/mở window trong cùng transaction với expected id/version (D40).
9. Brand INACTIVE không tự ẩn Product; Category INACTIVE không xuất hiện trong filter/navigation storefront (D41).

## Blocker môi trường

- `api/.env.local` được git-ignore và không bị track, nhưng DB host/tenant vẫn là placeholder `aws-0-region.pooler.supabase.com`. Lần chạy `test:e2e` ngày 2026-09-01 xác nhận Prisma không thể kết nối; cần thay bằng pooler host thật nhưng không được commit/in log credential.
- PostgreSQL local đã chạy 7 migrations; integration **3 suites/20 cases** và HTTP e2e **2 suites/10 cases** pass với `AUTH_BYPASS=false`.
- Runtime least-privilege DB role/RLS policy chưa được chốt; hiện migration owner có thể bypass RLS. Không được coi là production-ready cho đến khi có non-owner test.
