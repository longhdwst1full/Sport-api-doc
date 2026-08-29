# DCTD-UTC — Blueprint V1

Ngày chốt bản nháp: 2026-08-28  
Mục tiêu: hệ thống web/PWA bán thiết bị tập luyện, dụng cụ và đồ thể thao; có cổng quản trị đa chi nhánh.

## Kết luận kiến trúc

- Storefront/PWA: Next.js; Admin: Next.js hoặc React; API: NestJS modular monolith.
- Dữ liệu giao dịch: PostgreSQL. Redis + BullMQ dùng cho cache, job, reservation hết hạn. Ảnh/tệp ở object storage.
- Một đơn hàng thuộc đúng một chi nhánh và một kho; V1 không tách đơn qua nhiều kho.
- Giá sản phẩm dùng chung toàn hệ thống; chênh lệch vùng nằm ở phí giao hàng.
- V1 thanh toán chuyển khoản một lần cho toàn bộ đơn; nhân viên xác nhận hoặc sandbox QR.
- Tồn kho dùng `balance + immutable ledger + reservation`; không trừ kho bằng cách sửa trực tiếp số lượng sản phẩm.
- RBAC dùng mã quyền nghiệp vụ ổn định và data scope `GLOBAL/BRANCH/WAREHOUSE/OWN`; backend luôn kiểm tra quyền.
- Các thao tác rủi ro cao có maker-checker: hoàn tiền, điều chỉnh kho lớn, thay đổi giá nhạy cảm và gán quyền.
- V1 không gồm POS, ca thu ngân, tiền mặt, voucher phức tạp, bảo hành/sửa chữa, CRM automation, B2B quotation và split payment/fulfillment/return.

## Bộ tài liệu

| File                                  | Nội dung                                                              |
| ------------------------------------- | --------------------------------------------------------------------- |
| `01-scope-and-source-review.md`       | Phạm vi, giả định và kết quả tham khảo source                         |
| `02-function-catalog.csv`             | Danh mục chức năng V1 theo actor, priority và acceptance              |
| `03-database-v1.md`                   | Quy ước dữ liệu, quan hệ, transaction và index                        |
| `04-table-catalog.csv`                | Danh mục bảng V1, khóa, constraint, retention                         |
| `05-rbac-permissions.csv`             | Mã quyền ổn định và data scope áp dụng                                |
| `06-rules-and-state-machines.md`      | Business rules, state machine và invariant                            |
| `07-delivery-plan.md`                 | Thứ tự triển khai, Definition of Done và test bắt buộc                |
| `08-open-decisions.csv`               | Các quyết định cần xác nhận trước khi viết migration                  |
| `14-backend-review-sprint-1.md`       | Đánh giá backend, phạm vi, API và checklist Sprint 1 Organization/IAM |
| `15-architecture-contract-codegen.md` | Kiến trúc module, contract YAML, codegen theo domain và concurrency   |
| `16-nestjs-source-structure.md`       | Cấu trúc source NestJS, Prisma foundation, provider/integration base |
| `api/openapi-v1.yaml`                 | Contract OpenAPI V1 tổng được sinh từ NestJS                          |

## Cách dùng

1. Review `08-open-decisions.csv`; đổi cột `proposed_decision` nếu cần.
2. Chốt P0/P1 trong `02-function-catalog.csv`.
3. Chốt bảng P0 trong `04-table-catalog.csv`, rồi mới sinh ERD và migration.
4. Mỗi API phải truy ra được permission, data scope, transaction boundary và audit rule tương ứng.

## Quy ước priority

- `P0`: bắt buộc để bán hàng an toàn và vận hành được.
- `P1`: nằm trong V1 nhưng có thể phát hành sau P0 một nhịp.
- `DEFER`: không triển khai trong V1, chỉ để sẵn điểm mở rộng khi chi phí thấp.

Đây là blueprint logic, chưa phải migration cuối cùng. Những mục ghi `DECISION` phải được chủ dự án xác nhận trước khi code.
