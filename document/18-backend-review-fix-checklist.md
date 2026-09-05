# Backend review-fix và checklist kiểm thử Sprint 1

> **Snapshot lịch sử ngày 2026-08-29.** Các finding trong tài liệu này ghi lại trạng thái tại thời điểm review và không được dùng như trạng thái hiện tại. BF-01/BF-02, persisted Organization/IAM, HTTP e2e và phần lớn Catalog Wave 2 đã được triển khai sau đó. Trạng thái/checklist đang hiệu lực nằm tại `20-sprint-1-execution-status.md`; các mục production RLS/least-privilege, audit query, media và phần scope còn thiếu vẫn giữ nguyên là blocker.

Ngày review: 2026-08-29  
Phạm vi: toàn bộ thay đổi chưa commit phục vụ Sprint 0 foundation closure và khởi động Sprint 1.  
Phương pháp: review độc lập theo `review-fix`; vòng này không tự sửa source để giữ kết luận khách quan.

## 1. Issue theo cách hiểu của reviewer

Mục tiêu của thay đổi là đóng các blocker nền tảng còn thiếu trước Sprint 1: PostgreSQL migration từ zero, seed lặp lại, health có trạng thái database, audit writer append-only, CI gate; đồng thời chuẩn bị Organization/IAM/Catalog permission cho Sprint 1.

Đây chưa phải mục tiêu hoàn thành toàn bộ Sprint 1. IAM/Catalog hiện vẫn chủ yếu dùng in-memory adapter và header permission scaffold; vì vậy chỉ được ghi nhận là `FOUNDATION-CANDIDATE`, không phải `SPRINT-1-DONE` hay production-ready.

## 2. Checklist đánh giá fix

- [x] ✅ Fix đúng phần lớn root cause của foundation: có physical schema, migration, seed, DB health, audit table/writer và CI PostgreSQL.
- [ ] ⚠️ Không có thay đổi ngoài phạm vi: việc tự chuyển D22/D23 sang `DECIDED` cần Tech/Product xác nhận; health contract cũng đã thay đổi theo hướng breaking mà chưa có decision record.
- [ ] ⚠️ Không phát hiện regression: chưa đủ bằng chứng vì chưa có HTTP authorization/scope test, RLS role test, concurrency test và audit transaction test.
- [ ] ❌ Bao phủ edge case/dữ liệu biên: audit `TRUNCATE`, actor consistency, seed permission removal/reorder, database timeout và warehouse replacement chưa được bao phủ.
- [ ] ⚠️ Tuân thủ đầy đủ business rule/acceptance criteria: schema nền tảng phù hợp phần lớn DBML, nhưng audit atomicity, production identity và branch scope enforcement chưa hoàn thành.

Kết luận gate hiện tại: **REQUEST CHANGES trước khi merge/đánh dấu Sprint 0 Done**.

## 3. Phân tích từng nhóm thay đổi

| Nhóm thay đổi | Phần issue được xử lý | Kết quả review |
| --- | --- | --- |
| Prisma Wave 1 | Tạo 9 bảng Organization/IAM/Audit, FK, CHECK, index, RLS | Đúng hướng; migration chạy được từ DB rỗng. Còn thiếu audit actor constraint, TRUNCATE protection và test role thực tế |
| Seed | Branch + một warehouse, bootstrap user, role, permission, assignment | Chạy hai lần không tăng row hiện tại. Chưa hội tụ khi bỏ permission/grant; ID permission phụ thuộc vị trí mảng |
| Health | Trả database `enabled/status` | Contract rõ hơn và unit test 2 nhánh. Chưa test `up`, chưa test Prisma thật/HTTP, chưa có timeout/readiness production |
| Audit writer | Port + Prisma implementation fail-closed khi DB tắt | Đúng cho skeleton, nhưng coverage 0% và writer không nhận transaction client nên chưa thể bảo đảm mutation + audit atomic |
| Permission catalog | Bổ sung permission Catalog/Pricing cần cho Sprint 1 | Khớp các code tương ứng trong RBAC catalog; seed mới chỉ chứa subset, chưa phải toàn bộ permission V1 |
| CI | PostgreSQL service, migrate, seed x2, integration, lint/test/build/contract | Đúng chuỗi cơ bản; chưa có coverage threshold, HTTP/e2e, concurrency và role-based RLS test |
| OpenAPI | Bổ sung database health schema | Artifact đồng bộ, nhưng thêm required field và thu hẹp `status` là breaking contract về mặt schema; cần decision/version note |
| Tài liệu Sprint | Tách foundation closure khỏi feature delivery | Đúng, không tuyên bố IAM/Catalog persisted đã hoàn thành |

## 4. Findings cần xử lý

### BF-01 — HIGH — Audit chưa atomic với mutation nghiệp vụ

`PrismaAuditWriter` chỉ giữ `PrismaService` và tự gọi `auditLog.create`. Interface không nhận `Prisma.TransactionClient`, nên khi role/assignment/branch được persist, caller chưa có cách chắc chắn ghi business mutation và audit trong cùng transaction.

Tác động: mutation có thể commit nhưng audit fail, hoặc ngược lại; vi phạm DoD cho function nhạy cảm.

Yêu cầu fix: thiết kế transaction-bound audit writer hoặc truyền transaction context rõ ràng; thêm integration test rollback cả mutation lẫn audit ở hai hướng lỗi.

### BF-02 — HIGH — Append-only chưa chặn mọi đường xóa và actor chưa nhất quán

Trigger hiện chỉ chặn `UPDATE OR DELETE`, không chặn `TRUNCATE`. Constraint chỉ kiểm tra enum `actor_type`, chưa bắt buộc `USER => actor_user_id NOT NULL` và chưa cấm actor ID cho `SYSTEM/GUEST`.

Đã xác minh trực tiếp trên database review: `TRUNCATE TABLE audit_logs` được chấp nhận và một row `actor_type='USER', actor_user_id=NULL` insert thành công (cả hai probe được bọc transaction rồi rollback).

Tác động: lịch sử audit vẫn có thể bị xóa toàn bảng bởi owner/runtime role có quyền; log có thể không xác định actor dù API chấp nhận.

Yêu cầu fix: chặn `TRUNCATE`, thêm actor consistency constraint, test `UPDATE/DELETE/TRUNCATE` riêng và test các tổ hợp actor hợp lệ/không hợp lệ.

### BF-03 — HIGH — Seed permission chỉ idempotent ở trạng thái hiện tại, chưa convergent

`createMany({ skipDuplicates: true })` chỉ thêm role-permission, không thu hồi grant đã bị loại khỏi catalog. `permissionId(index)` làm ID phụ thuộc thứ tự mảng; chèn/xóa/reorder permission có thể làm ID mới va vào row cũ.

Đã xác minh trực tiếp: thêm grant giả lập `catalog.legacy.manage` cho `CATALOG_MANAGER`, chạy lại seed, grant dư vẫn còn (`count=1`).

Tác động: quyền cũ có thể tồn tại âm thầm; seed tương lai có thể fail hoặc cấp dư quyền.

Yêu cầu fix: ID ổn định độc lập thứ tự; sync tập quyền role trong transaction theo desired state; test add/remove/reorder và chạy seed nhiều lần.

### BF-04 — MEDIUM — Test RLS chưa chứng minh deny-by-default

Test hiện chỉ đếm 9 table có `relrowsecurity=true`. Kết quả database cho thấy `FORCE ROW LEVEL SECURITY=false`, không có policy; owner vẫn bypass RLS. Không có test chạy dưới role `anon/authenticated` hoặc runtime least-privilege role.

Tác động: tên testcase và tài liệu đang khẳng định mạnh hơn bằng chứng thực tế.

Yêu cầu fix: kiểm tra policy/grant, chạy truy vấn bằng role không phải owner và xác minh deny; tách runtime/migration role trước staging.

### BF-05 — MEDIUM — Health/config có thể báo xanh khi production thiếu DB

`DATABASE_ENABLED` mặc định `false`; production chưa bị fail-fast nếu flag này tắt. `/health` coi `disabled` là `ok`. Truy vấn health chưa có timeout riêng và không có HTTP status/readiness contract.

Tác động: deployment production có thể healthy dù persistence bị vô hiệu hóa hoặc health probe treo theo connection timeout.

Yêu cầu fix: chốt liveness/readiness; production bắt buộc DB enabled; readiness DB-down trả semantics phù hợp; thêm timeout và HTTP tests.

### BF-06 — MEDIUM — Coverage của code foundation quan trọng còn thiếu

Coverage tập trung trên các file thay đổi:

- `modules/audit/*`: 0% statements/functions.
- `database/prisma.service.ts`: 31.57% statements, 0% functions theo unit coverage.
- `health.controller.ts`: 100%, nhưng mới mock dependency và thiếu nhánh DB `up`.

Integration test kiểm chứng một số constraint trực tiếp, chưa đi qua `PrismaAuditWriter`, Nest provider graph hoặc HTTP pipeline.

### BF-07 — MEDIUM — Unique warehouse không khớp lifecycle ghi trong DBML

DBML mô tả partial unique cho một warehouse active/primary mỗi branch; migration dùng unique tuyệt đối trên `branch_id`. Sau soft delete/inactive, branch không thể tạo warehouse thay thế nếu nghiệp vụ cần.

Yêu cầu làm rõ: V1 bắt buộc tái sử dụng/reactivate đúng warehouse record hay cho phép thay thế có lịch sử. Sau khi chốt mới chọn unique tuyệt đối hoặc partial unique.

### BF-08 — MEDIUM — OpenAPI health thay đổi breaking chưa có decision

Response thêm required `database` và đổi `status` từ chuỗi tự do thành enum. Artifact producer/consumer đồng bộ nhưng chưa có API compatibility note hoặc version decision.

### BF-09 — LOW — Integration seed assertion khó mở rộng

Test assert tổng row tuyệt đối `1/1/1/3/1`; khi thêm fixture hợp lệ ở wave sau sẽ fail dù seed vẫn đúng. Nên assert các business key seed tồn tại đúng một lần và chụp count trước/sau lần seed thứ hai.

## 5. Test evidence đã chạy

| Gate | Kết quả | Bằng chứng |
| --- | --- | --- |
| API lint | ✅ PASS | exit 0 |
| Prisma validate | ✅ PASS | schema valid |
| Unit test | ✅ 12/12 suites; 23/23 tests | Jest run-in-band |
| Unit coverage toàn API | ⚠️ 28.33% statements; 27.93% lines | chưa có threshold |
| Fresh database migration | ✅ PASS | migration Wave 1 chạy từ database rỗng |
| Seed lần 1 + lần 2 | ✅ PASS | cả hai exit 0 |
| PostgreSQL integration | ✅ 1/1 suite; 5/5 tests | constraint/RLS flag/email/audit update rollback |
| OpenAPI generation | ✅ PASS | producer và consumer artifact sinh được |
| Production build | ✅ PASS | Prisma generate + Nest build |
| Git diff whitespace | ✅ PASS | `git diff --check` không lỗi |
| HTTP/e2e | ❌ MISSING | chưa có `jest-e2e.json`/suite đạt gate |
| Concurrency/locking | ❌ MISSING | chưa có test |
| Permission + branch scope qua PostgreSQL/API | ❌ MISSING | hiện mới unit in-memory + một DB CHECK |
| Audit writer unit/integration | ❌ MISSING | changed-file unit coverage 0% |
| RLS role isolation | ❌ MISSING | mới kiểm tra metadata flag |

## 6. Checklist testcase backend bắt buộc

### Foundation/config/health

- [x] ENV thiếu `DATABASE_URL` khi DB enabled bị reject.
- [x] ENV thiếu `DIRECT_URL` khi DB enabled bị reject.
- [ ] Production + `DATABASE_ENABLED=false` phải fail-fast.
- [ ] `PrismaService`: disabled không query DB.
- [ ] `PrismaService`: `SELECT 1` thành công trả `up`.
- [ ] `PrismaService`: query lỗi/timeout trả `down` trong giới hạn thời gian.
- [ ] HTTP `/api/v1/health`: schema/status code cho `up`, `down`, `disabled`.

### Migration/schema/security

- [x] Migration chạy từ database rỗng.
- [x] FK/CHECK scope reject GLOBAL kèm branch.
- [x] Partial unique active normalized email.
- [ ] Partial unique active normalized phone.
- [ ] Tất cả scope GLOBAL/OWN/BRANCH/WAREHOUSE: valid + invalid matrix.
- [ ] Duplicate active assignment cho từng scope bị reject; revoked/expired history theo rule đã chốt.
- [ ] Warehouse lifecycle theo quyết định unique tuyệt đối/partial unique.
- [ ] RLS query dưới `anon`, `authenticated`, runtime role bị deny đúng policy.
- [ ] Runtime role không có DDL/TRUNCATE/role-management privilege.

### Seed

- [x] Seed chạy hai lần trên DB rỗng.
- [ ] Row/business key không tăng giữa lần 1 và 2, không phụ thuộc tổng fixture khác.
- [ ] Permission reorder không gây PK conflict.
- [ ] Permission bị bỏ khỏi desired role được thu hồi.
- [ ] Permission mới được thêm đúng role.
- [ ] Seed failure trả exit code khác 0 và rollback toàn transaction.
- [ ] Seed không tạo active credential/password thật.

### Audit

- [x] Audit `UPDATE` bị reject và transaction rollback.
- [ ] Audit `DELETE` bị reject.
- [ ] Audit `TRUNCATE` bị reject.
- [ ] `actor_type=USER` bắt buộc `actor_user_id`.
- [ ] `SYSTEM/GUEST` actor rule theo decision được enforce.
- [ ] `PrismaAuditWriter` fail-closed khi DB disabled.
- [ ] Writer map đúng UUIDv7/timestamp/input JSON.
- [ ] Duplicate `request_id + sequence_no` bị reject/idempotent theo contract.
- [ ] Business mutation fail => audit rollback.
- [ ] Audit fail => business mutation rollback.
- [ ] Sensitive PII/token không xuất hiện trong before/after/log.

### IAM/authorization/scope

- [x] Unknown permission code bị deny ở unit in-memory.
- [x] Invalid scope shape bị deny ở unit in-memory.
- [ ] API không identity/token hợp lệ => 401.
- [ ] Unknown permission/role => deny server-side.
- [ ] GLOBAL/BRANCH/WAREHOUSE/OWN data-scope matrix qua API + PostgreSQL.
- [x] Cấp role và lock/unlock tăng `permission_version` atomic.
- [x] Concurrent duplicate assignment chỉ một request thành công.
- [x] Không lock/unlock bất kỳ OWNER; Branch Manager chỉ quản lý STAFF trong branch.
- [ ] Role system không được hard delete.
- [x] Create user, role assignment và lock/unlock ghi audit cùng transaction.

### Catalog Sprint 1

- [ ] Brand code/slug unique và archive rule.
- [ ] Category cycle/path/depth invariant.
- [ ] Product transition DRAFT → PUBLISHED → ARCHIVED, cấm jump state.
- [ ] Optimistic version conflict khi hai người sửa cùng record.
- [ ] Variant SKU unique; barcode partial unique.
- [ ] Storefront chỉ trả published product + active variant + effective price.
- [ ] Price decimal, effective window không overlap và concurrency-safe.
- [ ] Fixed combo không nested; quantity > 0; return nguyên combo.
- [ ] Media finalize xác minh provider asset, loại/size/checksum và ownership.

## 7. Checklist công việc backend theo thứ tự

| Thứ tự | Work item | Trạng thái | Gate để Done |
| --- | --- | --- | --- |
| 1 | BF-01 transaction-bound audit design | ⬜ TODO/BLOCKER | unit + PostgreSQL rollback tests |
| 2 | BF-02 audit constraint/trigger hardening | ⬜ TODO/BLOCKER | UPDATE/DELETE/TRUNCATE + actor matrix pass |
| 3 | BF-03 convergent permission seed | ⬜ TODO/BLOCKER | add/remove/reorder/repeat tests pass |
| 4 | BF-04 runtime/migration role và RLS test | ⬜ TODO | non-owner role integration evidence |
| 5 | BF-05 liveness/readiness + production config | ⬜ TODO | HTTP + timeout + fail-fast tests |
| 6 | Bổ sung unit test AuditWriter/PrismaService | ⬜ TODO | changed critical files có branch coverage phù hợp |
| 7 | Chốt warehouse lifecycle unique rule | ⬜ NEED DECISION | DBML/migration/test đồng bộ |
| 8 | Ghi API compatibility decision cho health | ⬜ NEED DECISION | version/note + consumer verification |
| 9 | Re-run clean DB migration/seed/integration | 🟨 PASS CURRENT | phải pass lại sau fix 1–8 |
| 10 | Implement Prisma Organization/IAM adapters | ⬜ TODO | API + auth + scope + transaction + audit tests |
| 11 | Thay header permission scaffold bằng verified identity | ⬜ TODO/BLOCKER STAGING | deny-by-default HTTP tests |
| 12 | Wave 2 Catalog/Pricing/Media | ⬜ TODO | AC/test matrix Catalog pass |
| 13 | OpenAPI export và FE SDK generation | 🟨 PARTIAL | contract diff reviewed; admin/client gates pass |

## 8. Giả định và câu hỏi cần chốt

### Giả định

- ⚠️ Rủi ro: D22 soft delete và D23 UUIDv7 được coi là quyết định Tech đã duyệt; chưa thấy bằng chứng người có thẩm quyền sign-off trong repository.
- Migration này chưa apply lên Supabase/staging thật; evidence chỉ từ PostgreSQL 16 local sạch.
- `DATABASE_ENABLED=false` chỉ phục vụ local tooling/OpenAPI, không được phép trong production persisted deployment.
- Một branch có đúng một warehouse trong V1, nhưng lifecycle thay warehouse chưa được định nghĩa.

### Câu hỏi cần làm rõ

1. D22/D23 đã được Tech Lead/Product chính thức duyệt chưa, hay phải trả lại trạng thái `PROPOSED`?
2. Khi warehouse ngừng hoạt động, có reactivate cùng record hay được tạo warehouse thay thế cho branch?
3. `/health` là liveness hay readiness? Có cần tách `/health/live` và `/health/ready`?
4. Runtime NestJS dùng DB role riêng least-privilege hay tiếp tục dùng owner/pooler credential?
5. Health response có consumer ngoài hai frontend hiện tại không để quyết định versioning?

## 9. Kết luận

- Khả năng phần **foundation fix đúng hướng**: **72%**. Điểm cộng là migration/seed/test/build chạy thật từ DB rỗng; điểm trừ lớn là audit atomicity, seed evolution, RLS evidence và production readiness chưa được chứng minh.
- Mức hoàn thành **Sprint 1 functional**: **khoảng 25%**. Mới có schema nền và in-memory use cases; chưa có persisted IAM/Catalog flow production-grade.
- Đề xuất: **CẦN SỬA THÊM**. Chỉ bắt đầu Wave 2 sau khi BF-01, BF-02 và BF-03 được đóng bằng testcase; không đánh dấu Sprint 0/Sprint 1 Done ở trạng thái hiện tại.
