# IAM module maintenance note

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-22
>
> **Change summary:** Bổ sung hai cửa leo thang đặc quyền và quy tắc chung chặn cả hai.

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

## Hai cửa leo thang đặc quyền

Quyền có thể đi vào tay một người qua **hai** đường, và cả hai phải áp cùng một quy tắc:

| Cửa | Chốt | Nơi kiểm |
| --- | --- | --- |
| **Sửa vai trò** — thêm quyền vào tập quyền của role | Chỉ cấp được quyền chính actor đang có; quyền role đã có sẵn được giữ lại để sửa tên không cần toàn quyền | `resolvePermissionCodes` |
| **Gán vai trò** — gắn một role sẵn có cho một tài khoản | Chỉ gán được role có tập quyền nằm trong tập quyền của actor | `assertCanGrantRole` |

Cửa thứ hai từng bỏ trống: `authorizeAssignment` chỉ kiểm role có thuộc nhóm gán được và actor có
phạm vi GLOBAL. Một tài khoản chỉ có `iam.assignment.manage` gán được `BRANCH_MANAGER` (32 quyền)
cho bất kỳ nhân viên nào — **kể cả chính mình** — và nhận đủ 32 quyền ở lần làm mới phiên kế tiếp.
`createStaffUser` cũng cấp vai trò nên chịu cùng chốt.

Quản trị viên gốc giữ toàn bộ catalog quyền nên không bị ảnh hưởng.

Hai chốt phải giữ **cùng** quy tắc. Siết một bên và để bên kia rộng hơn là cách để cửa còn lại
thành đường đi mặc định.

## Checklist khi sửa

- Kiểm tra privilege escalation ở **cả hai** cửa: sửa vai trò VÀ gán vai trò (gồm tự gán).
- Fixture test của quản trị viên gốc phải giữ toàn bộ catalog quyền. Để `permissions: []` sẽ làm
  mọi kiểm tra chống leo thang trôi qua mà không ai thấy.
- Kiểm tra OWNER full catalog, ACTIVE, assignment và account lifecycle.
- Kiểm tra GLOBAL/BRANCH scope và token invalidation.
- Chạy role administration, permission matrix, auth/session test và PostgreSQL integration
  nếu thay repository/transaction.
- Nếu đổi DTO/permission/behavior: cập nhật OpenAPI, generated Admin SDK, tài liệu contract và
  trạng thái bàn giao trong cùng task.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.1.0 | 2026-09-22 | Ghi hai cửa leo thang đặc quyền và chốt `assertCanGrantRole` cho đường gán vai trò. |
| 1.0.0 | 2026-09-20 | Tạo maintenance note và invariant OWNER full permission catalog. |
