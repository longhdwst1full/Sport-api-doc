# Feature maintenance notes

- Module có state machine, transaction, concurrency, provider hoặc từ hai use case trở lên phải có `src/modules/<module>/README.md`.
- README tối thiểu ghi: trách nhiệm/out-of-scope, entrypoint, bảng đọc/ghi, invariant, cấu hình, test và checklist khi sửa.
- Comment/JSDoc giải thích lý do, business invariant, transaction boundary, lock order, idempotency hoặc giới hạn provider. Không comment lại tên hàm hay cú pháp hiển nhiên.
- Khi hành vi thay đổi, cập nhật note trong cùng task. Nếu liên quan DB/API/permission/error contract, vẫn phải thực hiện đầy đủ traceability/OpenAPI/workbook; README không thay thế tài liệu chính thức.
- Không thêm comment vào Prisma Client, OpenAPI artifacts hoặc SDK generated; sửa source producer rồi regenerate.
