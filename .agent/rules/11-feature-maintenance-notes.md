# API feature maintenance notes

> **Rule version:** 1.1.0
>
> **Last updated:** 2026-09-09
>
> **Change summary:** Bắt buộc đọc/cập nhật module note và chuẩn hóa comment quyết định nghiệp vụ, transaction, security, idempotency trong code BE để bảo trì an toàn.

## 1. Đọc trước khi sửa

- Trước khi sửa module/use case, đọc `src/modules/<module>/README.md`, rule/state machine, OpenAPI operation và comment quyết định nằm sát controller/service/repository/provider liên quan.
- Xác định trước bảng đọc/ghi, transaction boundary, permission/scope, idempotency, audit và process/worker có thể bị ảnh hưởng.
- Nếu README/comment khác code, migration hoặc OpenAPI hiện tại, không chọn một nguồn theo cảm tính. Đối chiếu source of truth, test và decision log rồi cập nhật note trong cùng task.
- Module có state machine, transaction, concurrency, provider/worker hoặc từ hai use case trở lên phải có `src/modules/<module>/README.md`.

## 2. Nội dung README của module

README phải đủ ngắn để đọc trước khi sửa nhưng tối thiểu nêu:

- trách nhiệm, phạm vi và out-of-scope;
- controller/worker/public service entrypoint và OpenAPI operation liên quan;
- bảng đọc/ghi, aggregate/source of truth và module dependency;
- business invariant, state transition và pre/post-condition quan trọng;
- transaction boundary, lock order, optimistic version và idempotency/retry behavior;
- permission, branch/warehouse scope, audit và dữ liệu nhạy cảm;
- env/config, provider/fallback, timeout/cron và failure recovery nếu có;
- error code/HTTP semantics, test/evidence và checklist ảnh hưởng khi sửa.

Không chép nguyên schema/OpenAPI hoặc liệt kê từng method. README là bản đồ bảo trì; tài liệu DB, OpenAPI và workbook vẫn là source of truth chính thức.

## 3. Comment/JSDoc trong code

- Public controller/service method hoặc domain operation quan trọng phải có JSDoc ngắn khi use case, invariant hoặc side effect không thể suy ra đầy đủ từ type/name.
- Mọi đoạn xử lý không hiển nhiên liên quan business invariant, transaction/lock, idempotency, permission/scope, audit hoặc provider fallback phải có comment quyết định tại điểm thực thi.
- Comment đặt sát quyết định khó và giải thích **vì sao**, điều kiện áp dụng, hậu quả nếu đổi; không comment lại tên hàm hoặc diễn giải từng dòng code.
- Dùng prefix có thể tìm kiếm khi hữu ích:
  - `INVARIANT:` luật nghiệp vụ luôn phải đúng trước/sau operation.
  - `TRANSACTION:` các write phải atomic, lock order hoặc isolation/retry bắt buộc.
  - `IDEMPOTENCY:` khóa dùng lại, replay result và conflict behavior.
  - `SECURITY:` permission/scope, trust boundary hoặc dữ liệu phải redact.
  - `CONTRACT:` snapshot, compatibility hoặc semantics không thể hiện đủ trong DTO.
  - `PROVIDER:` timeout, fallback, mapping lỗi hoặc giới hạn tích hợp.
  - `WORKAROUND:` nguyên nhân, phạm vi, điều kiện hoặc issue để gỡ bỏ.
- TODO không được mơ hồ. Ghi điều kiện hoàn thành hoặc issue/decision liên quan; xóa comment khi workaround đã hết hiệu lực.

Ví dụ:

```ts
// TRANSACTION: Reserve và movement phải commit cùng nhau; lỗi một bước phải rollback để balance không lệch ledger.

// IDEMPOTENCY: Cùng key và cùng payload trả kết quả cũ; cùng key nhưng payload khác phải trả conflict.

// SECURITY: Scope từ token chỉ dùng để thu hẹp query; không nhận branchId của client làm bằng chứng quyền.
```

## 4. Đồng bộ khi thay đổi

- Khi behavior, invariant, transition, transaction, API, permission, scope, error contract, provider hoặc cấu hình thay đổi, cập nhật README/comment liên quan trong cùng task.
- Nếu liên quan DB/API/permission/error contract, vẫn phải chạy đầy đủ traceability, migration/OpenAPI và annotate workbook theo rule `08`; README/comment không thay thế tài liệu chính thức.
- Không thêm comment hoặc sửa tay Prisma Client, generated OpenAPI/SDK hay artifact sinh tự động; sửa source producer rồi regenerate.
- Mỗi business rule quan trọng phải có test ở mức phù hợp. Comment không được dùng để biện minh cho nhánh chưa test hoặc bỏ validation/authorization phía server.
- Review trước handoff phải kiểm tra: note còn đúng, comment không dư/thừa, operation/table/config được nhắc tới còn tồn tại và không còn TODO không có điều kiện đóng.

## Revision history

| Version | Date | Change summary | Source / Change ID |
| --- | --- | --- | --- |
| 1.1.0 | 2026-09-09 | Bổ sung quy trình đọc trước khi sửa, nội dung module README và comment prefix dành riêng cho BE. | Maintainability rule review |
