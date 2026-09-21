# IAM module maintenance note

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-20
>
> **Change summary:** Ghi nguồn quyền, scope và invariant bảo vệ quản trị viên OWNER duy nhất.

## Trách nhiệm và entrypoint

Module quản lý user nhân sự, role, permission, assignment và branch scope cho Admin API.
Entrypoint HTTP nằm tại `iam.controller.ts`; `IamService` giữ authorization/invariant và
`IamRepository` là boundary persistence. Authentication/session thuộc module `auth`, không
được chuyển vào IAM.

## Source of truth

- `iam.permissions.ts`: permission catalog và role baseline.
- Các bảng `users`, `roles`, `permissions`, `role_permissions`, `user_role_assignments` và
  `sessions`: dữ liệu runtime.
- `prisma/seed.ts`: bootstrap idempotent, không phải cơ chế reset cấu hình role.
- Nest controller/DTO là OpenAPI producer; Admin dùng SDK generate.

## Security invariant

- Chỉ principal có `iam.role.manage` và GLOBAL scope được quản trị role.
- OWNER là quản trị viên gốc duy nhất, luôn ACTIVE và luôn có toàn bộ `PERMISSION_CATALOG`.
- Không được assign/revoke OWNER qua API và không được lock tài khoản OWNER.
- Update OWNER được phép đổi metadata nhưng payload permission thiếu bất kỳ quyền nào bị từ
  chối ở Backend. UI disable chỉ là hỗ trợ UX, không phải security boundary.
- Seed chỉ bổ sung permission thiếu cho OWNER. Quyền BRANCH_MANAGER/STAFF đã cấu hình không
  bị seed ghi đè.
- Role mutation dùng optimistic `expectedVersion`; permission thay đổi phải làm tăng
  `permissionVersion` để token cũ mất hiệu lực.

## Lifecycle và xóa

- OWNER không được deactivate/delete.
- BRANCH_MANAGER/STAFF là system code được code tham chiếu; DELETE chuyển status sang
  `INACTIVE`, không physical delete.
- Custom role chỉ được physical delete khi không còn assignment. Các thay đổi nhạy cảm phải
  có audit context/request id.

## Checklist khi sửa

- Kiểm tra privilege escalation: actor không được cấp quyền mình không có.
- Kiểm tra OWNER full catalog, ACTIVE, assignment và account lifecycle.
- Kiểm tra GLOBAL/BRANCH scope và token invalidation.
- Chạy role administration, permission matrix, auth/session test và PostgreSQL integration
  nếu thay repository/transaction.
- Nếu đổi DTO/permission/behavior: cập nhật OpenAPI, generated Admin SDK, tài liệu contract và
  trạng thái bàn giao trong cùng task.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-20 | Tạo maintenance note và invariant OWNER full permission catalog. |
