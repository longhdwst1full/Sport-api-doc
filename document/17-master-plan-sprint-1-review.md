# Master Plan review và Sprint 1 execution baseline

Ngày rà soát: 2026-08-29  
Nguồn: Master Plan Sports Equipment E-commerce V1 và Global DoR/DoD do Product cung cấp.

## 1. Kết luận

Master Plan đúng về chuỗi dependency và ưu tiên correctness thay vì số màn CRUD. Tuy nhiên không nên đánh dấu Sprint 1 `READY` ngay từ baseline cũ: migration từ zero, seed lặp lại, durable audit skeleton, DB health và CI database gate chưa tồn tại.

Sprint 1 được bắt đầu theo hai lane tuần tự:

1. `S1-Foundation closure`: đóng blocker Sprint 0 bắt buộc cho IAM/Catalog.
2. `S1-Feature delivery`: IAM/RBAC/scope rồi Catalog/SKU/Media/Price.

Không đưa Cart, Inventory mutation, Order, Payment hoặc Shipping vào Sprint 1.

## 2. Các điểm đã tái cấu trúc từ plan

| Vấn đề | Quyết định áp dụng |
| --- | --- |
| Plan ghi 43 logical tables, model chuẩn đang có 74 bảng | 74 bảng trong DBML/table catalog là canonical; chỉ migrate theo wave, không tạo đồng loạt |
| Sprint 1 cần Branch Scope nhưng roadmap đưa Branch sang Sprint 2 | Sprint 1 giữ `branches`/`warehouses` tối thiểu cho IAM scope; nghiệp vụ inventory kho vẫn ở Sprint 2 |
| “Product → Variant → SKU” dễ hiểu thành ba entity | `product_variants` chính là sellable SKU; không tạo thêm bảng `skus` trùng nghĩa |
| Specification được ghi chung với P0 | Dynamic `attributes/*` giữ P1; Sprint 1 P0 chỉ core product/variant fields, có thể kéo P1 khi P0 ổn |
| Product form hiện nhận `price` và `availableQuantity` | Phải tách price sang `product_prices`; stock thuộc Sprint 2 và không nằm trên Product |
| Sprint 1 hai tuần chứa cả auth, RBAC và full Catalog | Chia lane/gate; không chạy song song phần phụ thuộc DB/permission chưa đạt |

## 3. Sprint 0 gate audit

| ID | Capability | Trạng thái sau lần triển khai này | Bằng chứng/ghi chú |
| --- | --- | --- | --- |
| FND-01 | Health Check | DONE-CODE | `/health` trả trạng thái service và database enabled/up/down/disabled |
| FND-02 | Config Validation | DONE | Env validation fail-fast đã có |
| FND-03 | Migration Runner | DONE-LOCAL | Prisma migration Wave 1; phải chạy smoke từ empty DB trong CI |
| FND-04 | Seed Runner | DONE-LOCAL | Seed branch/warehouse/user/roles/permissions; chạy lặp hai lần |
| FND-05 | Global Error Contract | DONE-BASE | Filter/DTO thống nhất; domain error code cần tiếp tục chuẩn hóa |
| FND-06 | Request Correlation | DONE | Request ID + structured log |
| FND-07 | Audit Writer Skeleton | DONE-CODE | Append-only table + writer fail-closed khi DB disabled |
| FND-08 | CI Gate | DONE-CODE | Workflow migration → seed x2 → lint/test/build/contract check |

`DONE-CODE` không đồng nghĩa production-ready. Supabase migration, advisor, backup/restore và staging identity vẫn cần evidence riêng.

## 4. Sprint 1 scope đã khóa

### P0 — IAM/RBAC

| ID | Function | DoR/Acceptance chính | Trạng thái |
| --- | --- | --- | --- |
| IAM-03 | Staff user lifecycle | Super Admin; invite/lock/unlock/revoke; không khóa super admin cuối | TODO |
| IAM-04 | Role/permission | Unknown permission deny; stable code; role system không xóa | IN-PROGRESS |
| IAM-05 | Assignment scope | GLOBAL/BRANCH/WAREHOUSE/OWN đúng FK; duplicate fail; permission version tăng atomic | IN-PROGRESS |
| IAM-06 | Audit query | Append-only; che dữ liệu nhạy cảm; lọc actor/action/entity/request | IN-PROGRESS |

Customer registration/login/forgot password (`IAM-01/02`) cần thiết cho V1 nhưng không nằm trên critical path quản trị Catalog; đưa vào Sprint 3 cùng Customer/Guest trừ khi team có thêm capacity độc lập.

### P0 — Catalog/Pricing/Media

| ID | Function | DoR/Acceptance chính | Trạng thái |
| --- | --- | --- | --- |
| CAT-01 | Brand | code/slug unique; archive master; logo media asset | TODO |
| CAT-02 | Category tree | chặn cycle; path/depth nhất quán; không xóa khi đang dùng | TODO |
| CAT-03 | Product SPU | DRAFT → PUBLISHED → ARCHIVED; optimistic version; không có stock/price | TODO |
| CAT-04 | Variant/SKU | SKU unique; barcode partial unique; archive thay hard delete | TODO |
| CAT-05 | Product media | một primary theo product/variant; asset đã finalize | IN-PROGRESS |
| CAT-07 | Storefront catalog | chỉ published product + active variant + effective regular price | TODO |
| CAT-12 | Fixed combo | không nested; component quantity > 0 | TODO |
| PRI-01 | Effective price | decimal; thời gian không overlap; audit actor; optimistic version | TODO |

`CAT-06` dynamic specification/attribute là P1 và chỉ kéo vào khi các P0 trên đạt integration test.

## 5. Thứ tự implementation

1. Apply/verify Wave 1 migration trên empty PostgreSQL; seed hai lần; kiểm tra constraints/RLS/audit immutability.
2. Thêm Prisma adapters cho Organization/IAM và switch bằng configuration; giữ in-memory cho unit test.
3. Tích hợp AuditWriter vào create role, assignment và branch mutation trong cùng transaction.
4. Thay permission header scaffold bằng verified staff identity trước staging.
5. Tạo Wave 2 migration cho media metadata + brand/category/product/variant/media/price/bundle.
6. Refactor Catalog contract: loại `availableQuantity` khỏi write DTO, tách price command, thêm publish transition/version.
7. Export OpenAPI → generate Admin/Client SDK → hoàn thiện UI state và permission gates.

## 6. Global DoD áp dụng cho Sprint 1

- Không function nào được DONE nếu chỉ có in-memory test.
- Mutation nhạy cảm phải có authorization, scope, transaction, audit và concurrency behavior.
- Migration phải chạy từ empty DB; seed chạy lặp không tạo duplicate.
- PostgreSQL integration test phải kiểm chứng FK/unique/check/partial index và audit append-only.
- Storefront chỉ thấy published/effective data; Admin có loading/empty/error/disabled/success.
- OpenAPI và generated SDK là một contract chain; không viết tay endpoint/DTO ở frontend.
- Không secret trong migration, seed, log, generated SDK hoặc repository.

## 7. Open decisions còn chặn production, không chặn schema Wave 1

- D19 retention 10 năm: cần Legal/Finance xác nhận trước partition/archive policy.
- D20 RPO 15 phút/RTO 4 giờ: cần backup/restore drill và chi phí được duyệt.
- D12 price approval threshold và D14 global price scope phải chốt trước khi PRI-01 được DONE.
- Production auth/session strategy và ingress trusted-proxy policy chưa chốt.

## 8. Sprint evidence bắt buộc

- Migration log từ empty database.
- Seed lần 1 và lần 2 đều thành công, row count không tăng ngoài dự kiến.
- SQL test scope CHECK, partial unique email/phone và assignment uniqueness.
- Audit UPDATE/DELETE bị database từ chối.
- API integration evidence cho permission/scope và Catalog published filtering.
- OpenAPI diff, generated SDK diff, screenshots loading/empty/error/success.
- GitNexus impact/change detection và danh sách bug P0/P1 còn mở.
