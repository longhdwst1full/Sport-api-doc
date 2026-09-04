# Sprint 1 execution status

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-04
>
> **Change summary:** Cập nhật CKEditor 4 theo base admin-client, bỏ custom Cloudinary uploader và bổ sung regression test cấu hình editor.

## Kết luận

Sprint 1 hiện đạt khoảng **99% functional scope** và **94% Definition of Done**. Phần code V1 đã đóng token transport BODY dev/HttpOnly COOKIE production, bắt buộc đổi mật khẩu staff, auto-lock atomic ở lần sai mật khẩu thứ 5, audit query GLOBAL owner-only, price scheduling/history và tồn kho PostgreSQL có ledger/idempotency. Migration từ zero, seed lặp, integration và HTTP e2e đã chạy lại trên PostgreSQL 16 local. Sprint chưa ký DONE chính thức vì full permission HTTP matrix và BA/QA trên environment chung chưa ký nhận.

Hai tỷ lệ không được tính theo số file hoặc số endpoint:

- **Functional scope 99/100**: chức năng người dùng thực hiện được so với phạm vi Sprint 1 đã khóa.
- **Definition of Done 94/100**: mức hoàn thiện kỹ thuật gồm validation, authorization, transaction, test, migration, audit, tài liệu và QA acceptance; 6 điểm còn lại thuộc permission regression đầy đủ và BA/QA acceptance trên environment chung.

## Bảng điểm có trọng số

### Functional scope — 99/100

| Nhóm | Trọng số | Điểm đạt | Evidence chính | Phần còn thiếu |
| --- | ---: | ---: | --- | --- |
| Foundation/platform | 15 | **15** | Config validation, DB/migration/seed, error envelope, request-id, audit writer, CI foundation, OpenAPI V1 | Production readiness được tính trong DoD |
| IAM/RBAC | 25 | **25** | Auth email/phone; lockout 5 lần; forced password; BODY/COOKIE transport; fixed roles/scope; audit query/redaction | Full HTTP permission matrix còn là DoD evidence |
| Catalog/Pricing/Media | 40 | **40** | Catalog CRUD/lifecycle; media; combo; atomic price replace; future schedule/current/upcoming/history; >20% rule | Update bundle composition sau publish chuyển P1 |
| Admin/Storefront/contract | 20 | **19** | Generated Orval SDK; forced-password screen; audit screen; price lifecycle panel; Storefront auth transport/PWA | QA acceptance evidence toàn màn |
| **Tổng** | **100** | **99** |  |  |

### Definition of Done — 94/100

| Nhóm DoD | Trọng số | Điểm đạt | Lý do chưa đủ điểm |
| --- | ---: | ---: | --- |
| Backend implementation + validation | 25 | **25** | Auth lockout/forced password, audit query và price lifecycle đã có validation |
| Authorization + transaction + concurrency | 20 | **19** | Auto-lock/session revoke/audit atomic; thiếu rerun full permission/scope HTTP matrix và least-privilege DB evidence |
| Frontend happy/error/loading/empty/disabled | 15 | **15** | Variant/Media/IAM revoke đã ghép generated SDK; còn QA acceptance toàn màn |
| Unit + integration + HTTP tests | 20 | **20** | Unit, fresh migration, PostgreSQL integration và HTTP e2e đều xanh; inventory idempotency/audit chạy DB thật |
| Migration + seed + audit + contract docs | 10 | **10** | Migration/schema/OpenAPI/DBML/catalog/change-log/workbook trace đã cập nhật; production DB role thuộc release hardening |
| BA acceptance + QA regression + release evidence | 10 | **5** | Chưa có BA sign-off và full regression environment chung |
| **Tổng** | **100** | **94** |  |

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
- [x] API unit sau closeout: **23 suites, 80/80 tests**; có lockout lần 5, token transport, audit GLOBAL scope/redaction, price rules và persisted inventory idempotency/projection.
- [x] Admin lint/test/build: **10 files, 18/18 tests**; thêm forced-password, audit query và price current/upcoming/history từ generated SDK.
- [x] Client lint/test/build: **3 files, 4/4 tests**; `/` 144 kB First Load JS, auth transport hỗ trợ access-memory/refresh-cookie.
- [x] OpenAPI producer JSON, V1 YAML, domain slices và Admin/Client Orval SDK đã regenerate; generated source không sửa tay.
- [x] Fresh database `dctd_verify_sprint1_20260903`: **9/9 migration**, foundation seed, demo seed chạy hai lần; database tạm đã được xóa.
- [x] PostgreSQL integration sau closeout: **3 suites, 21/21 tests**; audit append-only được giữ đúng trong teardown.
- [x] HTTP e2e `AUTH_BYPASS=false`: **2 suites, 11/11 tests**; bổ sung stock adjustment persist/replay/conflict/audit trên DB thật.
- [x] Admin CKEditor regression: **11 test files, 19/19 tests**; CDN failure vẫn cho nhập HTML và retry; production build giữ editor ở lazy chunk riêng.
- [x] API unit cuối: **23 suites, 81/81 tests**; API lint, Prisma validate và build pass.
- [x] Inventory E2E phát hiện và sửa bind `uuid IN (text)` (`P2010/42883`) thành từng parameter `::uuid`; regression DB thật pass.
- [x] Admin lint, **10 files/18 tests**, production build; Client typecheck, **3 files/4 tests**, Next.js production build.
- [~] GitNexus re-index: **5.734 nodes, 10.789 edges, 215 clusters, 240 flows**; `detect_changes` cảnh báo **CRITICAL** vì thay đổi xuyên auth/OpenAPI/Admin/Storefront/Inventory. Risk được giảm bằng full gate nêu trên nhưng vẫn cần QA regression environment chung trước release.

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
- [x] Dev BODY giữ sessionStorage; production COOKIE giữ refresh token HttpOnly và access token memory; shared fetcher attach/rotate tương thích.
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
- [x] API/màn hình list-filter audit cursor có redaction; permission + GLOBAL scope được kiểm tra server-side.
- [x] Bắt buộc đổi mật khẩu cho staff mới và sau unlock; token hạn chế chỉ cho me/change-password/logout.
- [x] Sai mật khẩu lần 5 chuyển LOCKED, revoke session và audit trong một transaction; login thành công trước ngưỡng reset counter.
- [~] Full permission + GLOBAL/BRANCH policy có unit/core e2e; cần rerun full HTTP matrix trên DB environment hợp lệ.

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
- [x] API + Admin quản lý giá current/upcoming/history; future scheduling, no-retroactive, immutable history và replace optimistic atomic.
- [x] Giảm giá trên 20% yêu cầu reason, hiển thị cảnh báo xác nhận và chỉ permission OWNER hiện có thể mutate giá.

### Inventory cơ bản

- [x] `inventory_balances` theo `warehouse_id + product_variant_id`; không dùng `Product.quantity`.
- [x] Điều chỉnh tạo balance đầu kỳ khi chưa có, khóa row theo thứ tự SKU, chặn `on_hand < reserved` và cập nhật optimistic version.
- [x] `stock_adjustments`, items, append-only `inventory_movements` và audit được ghi trong cùng transaction Serializable.
- [x] `Idempotency-Key` có payload hash; cùng key/cùng payload replay snapshot, cùng key/khác payload trả 409.
- [x] `adjustment_no` mã hóa đủ UUID thành base36 trong varchar(32); regression E2E tạo hai phiếu liên tiếp để chặn collision từ UUIDv7 timestamp prefix.
- [x] GLOBAL/BRANCH scope được kiểm tra theo warehouse server-side; combo virtual không có physical balance riêng.
- [x] Demo seed có 3 balance SKU thường ở kho HCM; rerun không reset số lượng đã vận hành.
- [x] Migration/integration/HTTP evidence chạy trên fresh PostgreSQL 16; request rỗng bị chặn, transaction conflict trả 409 có thể retry.
- [ ] Update bundle items và preview availability theo component.

### Admin/Storefront

- [x] Admin sidebar/header/menu và management page base.
- [x] Admin login thật qua email/SĐT; local seed có đúng một bootstrap OWNER ACTIVE và bắt buộc đổi password ở lần đầu.
- [x] IAM list/create/assign/lock/unlock UI.
- [x] Branch + một warehouse CRUD/lifecycle UI.
- [x] Brand/category/product/variant/combo core UI.
- [x] CKEditor4 theo base admin-client, dùng Image dialog tích hợp; không gắn custom Cloudinary uploader; vẫn có loading/error/retry và HTML fallback khi CDN lỗi.
- [x] Axios canonical fetcher/error mapping; loading/error patterns.
- [x] Storefront Next.js và PWA base; Catalog list/detail generated API.
- [~] UI states có ở flow chính, chưa có QA matrix toàn bộ màn.
- [x] Product media upload/attach/alt/primary/reorder/archive UI; media library dùng lại toàn hệ thống vẫn là MED-02/P1.
- [x] Hoàn thiện price scheduling/history UI theo SKU, gồm loading/error/empty/disabled/confirm states.

### Trước khi chốt Sprint 1 DONE

- [~] PostgreSQL local hoạt động; Supabase dev/staging vẫn cần pooler host thật mà không commit secret.
- [x] 9 migration chạy từ zero, seed demo có 4 product gồm combo và chạy lặp; 21 PostgreSQL integration + 11 HTTP e2e pass.
- [ ] Chạy full permission/branch-scope regression.
- [x] Variant update, Product Media và Price scheduling/history UI đã hoàn thiện core.
- [x] Decision/model trace đã cập nhật cho audit query, forced password, lockout, token transport và pricing.
- [ ] BA acceptance và QA regression trên environment chung.
- [ ] Không còn P0/P1 bug mở.
- [ ] Lưu screenshot/API/test/log evidence và cập nhật Function Matrix.

### Ngoài phạm vi Sprint 1

- Order/POS tại cửa hàng, Customer persistence/CRUD, Payment và Fulfillment vẫn ở delivery wave sau. Không nâng màn fixture thành CRUD giả trước khi các aggregate, transition, transaction và OpenAPI contract tương ứng hoàn thành.

## Ưu tiên để tăng tỷ lệ

1. **Full permission/branch-scope HTTP matrix**: phần engineering evidence còn lại trước staging.
2. **BA/QA acceptance trên environment chung**: demo toàn màn, regression và bằng chứng screenshot/log.
3. **Supabase staging credentials + least-privilege runtime role**: release hardening, không commit secret.

## Function checklist

| ID | Trạng thái | Đã có | Còn thiếu để DONE |
| --- | --- | --- | --- |
| IAM-01 Customer auth | DONE-CORE | Register CUSTOMER ACTIVE; email/phone identifier; E.164; Argon2; session/audit atomic; Storefront login/register generated SDK; DB e2e pass | Verification; protected-API auto attach/refresh; forgot password nằm IAM-02 |
| IAM-03 Staff lifecycle | DONE-V1-CORE | Tạo ACTIVE staff; default password; forced change; sai lần 5 auto-lock; manual lock/unlock reset password; revoke session/audit atomic; DB integration pass | QA acceptance trên environment chung |
| IAM-04 Fixed RBAC | DONE-CORE | 3 system roles; deny unknown; no create-role API; seed hội tụ | Test matrix toàn permission catalog |
| IAM-05 Assignment scope | DONE-V1-CORE | GLOBAL/BRANCH; duplicate 201/409; assign/revoke atomic; permissionVersion; audit; OWNER revoke deny | Thêm full e2e Branch Manager cross-branch deny matrix |
| IAM-06 Audit | DONE-V1-CORE | Append-only; actor constraint; cursor filter API; GLOBAL owner-only; recursive redaction; Admin list/detail snapshots | QA acceptance và retention job sau V1 |
| CAT-01 Brand | DONE-CORE | Persisted create/list/update/active-search/activate/deactivate; optimistic version; audit; admin screen | Logo asset workflow độc lập |
| CAT-02 Category | DONE-V1-CORE | Persisted create/list/update/search/activate/deactivate; parent immutable; chặn tắt cha còn con active | Move subtree đã chốt P1; tiếp tục in-use test matrix |
| CAT-03 Product SPU | DONE-CORE | Create/list/detail/update/publish/archive/reactivate-to-DRAFT; STANDARD/BUNDLE invariant; aggregate row locking; version conflict; audit; Admin productType generated UI | Một số metadata edit nâng cao |
| CAT-04 Variant/SKU | DONE-V1-CORE | Persisted create/update/archive/reactivate; SKU immutable; barcode/dimension validation; optimistic version; admin drawer | QA acceptance toàn màn |
| CAT-05 Product media | DONE-V1-CORE | Cloudinary verify + persist idempotent; attach/update/reorder/archive; ownership/primary; product version; Admin panel | MED-02 media library/reuse và provider cleanup là P1 |
| CAT-07 Storefront catalog | DONE-CORE | Chỉ PUBLISHED + sellable variant; minPrice loại INACTIVE; category INACTIVE không lọc/hiện; slug detail/list | Brand/price filter, sort và SEO detail page |
| CAT-12 Fixed combo | DONE-LIFECYCLE-CORE | Persisted per variant; no nested; quantity > 0; publish validate component; publish/archive concurrency invariant; response bundle per SKU | Update bundle items và preview stock availability theo thành phần |
| PRI-01 Effective price | DONE-V1-CORE | Decimal(19,2), VAT-included global; no-overlap/no-retroactive; future schedule; current/upcoming/history; immutable history; >20% reason/confirm; replace optimistic atomic | Promotion/maker-checker ngoài V1 |
| INV-01 Balance + adjustment | DONE-V1-CORE | PostgreSQL balance/adjustment/items/movement; Serializable row lock; idempotency replay/conflict; branch scope; audit; demo seed; fresh migration và HTTP e2e pass | Full branch-scope HTTP matrix và QA acceptance |

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
10. Refresh token dùng BODY ở development; production bắt buộc HttpOnly COOKIE, access token chỉ ở memory và CORS origin explicit.
11. Audit V1 chỉ OWNER/GLOBAL; output redact credential, hash, email và phone.
12. Price V1 cho phép future schedule, cấm retroactive; không sửa/xóa history; giảm trên 20% cần reason và OWNER xác nhận, không maker-checker.

## Blocker môi trường

- `api/.env.local` được git-ignore và không bị track, nhưng Supabase host/tenant vẫn là placeholder; staging cần pooler host thật nhưng không được commit/in log credential. Việc này không chặn local Sprint evidence vì PostgreSQL 16 local đã pass toàn bộ migration/test.
- PostgreSQL local đã chạy fresh **9 migrations**; integration **3 suites/21 cases** và HTTP e2e **2 suites/11 cases** pass với `AUTH_BYPASS=false`.
- Runtime least-privilege DB role/RLS policy chưa được chốt; hiện migration owner có thể bypass RLS. Không được coi là production-ready cho đến khi có non-owner test.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.0.0 | 2026-09-04 | Cập nhật trạng thái và evidence mới nhất của Sprint 1. | Current worktree Sprint review |
| 1.1.0 | 2026-09-04 | Chuyển rich-text editor sang cấu hình CKEditor 4 không phụ thuộc Cloudinary uploader. | User decision 2026-09-04 |
