# DCTD-UTC — Blueprint V1

> **Document version:** 1.3.0
>
> **Last updated:** 2026-09-05
>
> **Change summary:** Bổ sung execution status/checklist Sprint 2 Branch, Warehouse và Inventory Core.

Ngày chốt bản nháp: 2026-08-28  
Mục tiêu: hệ thống web/PWA bán thiết bị tập luyện, dụng cụ và đồ thể thao; có cổng quản trị đa chi nhánh.

## Kết luận kiến trúc

- Storefront/PWA: Next.js; Admin: Next.js hoặc React; API: NestJS modular monolith.
- Dữ liệu giao dịch: PostgreSQL. Redis + BullMQ dùng cho cache, job, reservation hết hạn. Ảnh/tệp ở object storage.
- Một đơn hàng thuộc đúng một chi nhánh và một kho; V1 không tách đơn qua nhiều kho.
- Giá sản phẩm dùng chung toàn hệ thống; chênh lệch vùng nằm ở phí giao hàng.
- V1 thanh toán đúng một lần cho toàn bộ đơn bằng tiền mặt hoặc chuyển khoản; giá hiển thị đã gồm VAT.
- Tồn kho dùng `balance + immutable ledger + reservation`; không trừ kho bằng cách sửa trực tiếp số lượng sản phẩm.
- RBAC V1 chỉ có `OWNER`, `BRANCH_MANAGER`, `STAFF`; API/UI hoạt động với scope `GLOBAL/BRANCH` và backend luôn kiểm tra quyền/scope.
- Maker-checker chỉ áp dụng khi use case rủi ro được duyệt riêng; Catalog/price V1 dùng audit + optimistic locking, không maker-checker.
- V1 không gồm POS, ca thu ngân, tiền mặt, voucher phức tạp, bảo hành/sửa chữa, CRM automation, B2B quotation và split payment/fulfillment/return.

## Bộ tài liệu

| File                                  | Nội dung                                                              |
| ------------------------------------- | --------------------------------------------------------------------- |
| `01-scope-and-source-review.md`              | Phạm vi, giả định và kết quả tham khảo source |
| `02-function-catalog.csv`                    | Danh mục chức năng V1 theo actor, priority và acceptance |
| `03-database-v1.md`                          | Quy ước dữ liệu, quan hệ, transaction và index |
| `04-table-catalog.csv`                       | Danh mục bảng V1, khóa, constraint, retention |
| `05-rbac-permissions.csv`                    | Mã quyền ổn định và data scope áp dụng |
| `06-rules-and-state-machines.md`             | Business rules, state machine và invariant |
| `07-delivery-plan.md`                        | Thứ tự triển khai, Definition of Done và test bắt buộc |
| `08-open-decisions.csv`                      | Các quyết định cần xác nhận trước khi viết migration |
| `09-v1-model.dbml`                           | Model bảng/cột/FK logic dùng để đối chiếu migration |
| `10-v1-model-relationship-review.md`         | Review quan hệ, ownership, lifecycle và constraint |
| `11-model-change-log.json`                   | Nhật ký DB/API dùng để tô đỏ và gắn Note vào workbook |
| `12-frontend-base-source-review.md`          | Review source FE nền và quyết định kế thừa |
| `13-frontend-state-and-library-decisions.md` | Quyết định state và thư viện cho FE |
| `14-backend-review-sprint-1.md`              | Đánh giá backend, phạm vi, API và checklist Sprint 1 Organization/IAM |
| `15-architecture-contract-codegen.md`        | Kiến trúc module, contract YAML, codegen theo domain và concurrency |
| `16-nestjs-source-structure.md`              | Cấu trúc source NestJS, Prisma foundation, provider/integration base |
| `17-master-plan-sprint-1-review.md`          | Review Master Plan và baseline thực thi Sprint 1 |
| `18-backend-review-fix-checklist.md`         | Review-fix backend và checklist kiểm thử Sprint 1 |
| `19-admin-api-v1-contract-integration.md`    | Mapping API V1, permission và generated admin consumer |
| `20-sprint-1-execution-status.md`            | Trạng thái Sprint 1 hiện tại, evidence, phần còn thiếu và blocker |
| `21-admin-crud-coverage.md`                  | Coverage CRUD admin thật, phần fixture/scaffold và demo seed |
| `22-repository-split-and-deployment.md`      | Ranh giới ba repository, contract sync, CI và quy trình deploy |
| `23-id-migration-and-startup.md`             | Migration UUID sang BIGINT IDENTITY, startup DB và runbook Supabase |
| `24-telegram-command-bot.md`                 | Telegram webhook/local Codex Worker, allowlist, security và runbook |
| `25-sprint-2-execution-status.md`            | Scope, function matrix, business decision và checklist Sprint 2 |
| `26-bao-an-sport-demo-seed.md`               | Demo seed Bảo An Sport (đã thay bằng catalog thật) |
| `26-sprint-3-execution-plan.md`              | Sprint 3 — Customer, Cart, Checkout, Reservation, Shipping |
| `27-catalog-identifier-business-rules.md`    | Quy tắc nghiệp vụ cho định danh catalog |
| `28-sprint-3-execution-status.md`            | Sprint 3 — trạng thái thực thi |
| `29-reservation-expiry-worker-runbook.md`    | Runbook worker dọn đặt chỗ tồn kho quá hạn |
| `30-sprint-4-execution-plan.md`              | Sprint 4 — Order, Payment, Fulfillment safe flow |
| `31-order-maintenance-worker-runbook.md`     | Runbook worker bảo trì đơn hàng |
| `32-sprint-5-execution-status.md`            | Sprint 5 — Fulfillment & Shipping, trạng thái thực thi |
| `33-sprint-6-execution-plan.md`              | Sprint 6 — Return, Refund, Flash Sale (S6.1–S6.3 chưa bắt đầu) |
| `34-flash-sale-quota-expiry-runbook.md`      | Runbook worker dọn quota Flash Sale quá hạn |
| `35-flash-sale-quota-hardening-plan.md`      | Trace lỗi quota Flash Sale và phương án sửa |
| `36-delivery-status.md`                      | **Nguồn tiến độ duy nhất** — mọi tài liệu sprint khác đã đóng băng |
| `DCTD-UTC-V1-database-model-review.xlsx`     | Workbook review có ô đỏ, Excel Note và sheet Change Log |
| `api/openapi-v1.yaml`                        | Contract OpenAPI V1 tổng được sinh từ NestJS |

## Cách dùng

1. Review `08-open-decisions.csv`; đổi cột `proposed_decision` nếu cần.
2. Chốt P0/P1 trong `02-function-catalog.csv`.
3. Chốt bảng P0 trong `04-table-catalog.csv`, rồi mới sinh ERD và migration.
4. Mỗi API phải truy ra được permission, data scope, transaction boundary và audit rule tương ứng.
5. Khi sửa DB/API, cập nhật `11-model-change-log.json` rồi chạy `yarn workspace @dctd/api docs:model:annotate`; không handoff nếu workbook chưa được đánh dấu.

## Quy ước priority

- `P0`: bắt buộc để bán hàng an toàn và vận hành được.
- `P1`: nằm trong V1 nhưng có thể phát hành sau P0 một nhịp.
- `DEFER`: không triển khai trong V1, chỉ để sẵn điểm mở rộng khi chi phí thấp.

Đây là blueprint logic, chưa phải migration cuối cùng. Những mục ghi `DECISION` phải được chủ dự án xác nhận trước khi code.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.3.0 | 2026-09-05 | Bổ sung execution status và checklist Sprint 2. | S2-BASELINE-20260905 |
| 1.2.0 | 2026-09-05 | Thêm local Codex Worker và notification Telegram. | OPS-20260905-TELEGRAM-CODEX-WORKER |
| 1.1.0 | 2026-09-05 | Bổ sung Telegram command bot vào chỉ mục tài liệu. | API-20260905-TELEGRAM-COMMAND-BOT |
| 1.0.0 | 2026-09-05 | Bổ sung runbook D43 vào chỉ mục tài liệu. | D43 |
