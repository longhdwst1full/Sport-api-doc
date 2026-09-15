# Auth module — maintenance note

> **Document version:** 1.2.0
>
> **Last updated:** 2026-09-15
>
> **Change summary:** Cache không nhận assignment có `valid_to` tương lai; bổ sung `x-required-permissions` trong OpenAPI.

## Trách nhiệm

Xác thực staff/customer, phát và xoay token, và **resolve permission + data scope** cho `PermissionGuard`.

Out of scope: quản trị role/permission/assignment (thuộc `modules/iam`), và quyết định menu/navigation của FE.

## Entry points

| File | Vai trò |
| --- | --- |
| `auth.controller.ts` | `AdminAuthController` (`api/v1/admin/auth/*`) và `StorefrontAuthController` (`api/v1/auth/*`). |
| `auth.service.ts` | Login/refresh/logout/change-password và `authorizeAccessToken`. |
| `auth-token-transport.service.ts` | BODY vs COOKIE transport cho refresh token. |
| `auth.dto.ts` | Contract sinh OpenAPI; `CurrentUserDto` là nguồn dữ liệu phân quyền cho FE. |

OpenAPI operation: `loginAdmin`, `refreshAdminToken`, `logoutAdmin`, `changeAdminPassword`, `getAdminCurrentUser`, `registerCustomer`, `loginCustomer`, `refreshCustomerToken`, `logoutCustomer`, `getCustomerCurrentUser`.

## Bảng đọc/ghi

- Đọc/ghi: `auth_sessions`, `users`.
- Chỉ đọc: `user_role_assignments`, `roles`, `role_permissions`, `permissions`.
- Ghi qua `AuditWriter`: `audit_logs`.

Source of truth của quyền là `modules/iam`. Auth chỉ **chiếu** (project) dữ liệu đó vào `AuthPrincipal`; không sửa role/assignment.

## Invariant

- `users.permission_version` được nhúng vào access token claim `pv`. Token có `pv` khác giá trị hiện tại bị từ chối ngay — đây là cơ chế thu hồi quyền tức thì, thay cho TTL.
- Session bị revoke hoặc hết hạn bị loại ở **mọi** request; không bao giờ cache session.
- Assignment chỉ có hiệu lực khi `status = ACTIVE`, `valid_from <= now`, `valid_to` null hoặc tương lai, và `role.status = ACTIVE`.

## Cache permission

`AuthService.resolveGrants` cache `{permissions, scopes}` trong process, key `${userId}:${permissionVersion}`, TTL 60s, tối đa 5.000 entry (đầy thì clear toàn bộ).

An toàn vì key chứa `permissionVersion`: đổi quyền ⇒ đổi key ⇒ không thể phục vụ entry cũ. TTL chỉ giới hạn bộ nhớ. Mỗi replica cache độc lập, không cần store chia sẻ.

**Khi sửa:** nếu thêm đường thay đổi quyền mà **không** bump `users.permission_version`, cache này sẽ trả dữ liệu cũ tới 60s. Mọi mutation quyền trong IAM phải bump version.

Quyền hết hạn do thời gian trôi qua không bump gì cả, nên assignment có `valid_to` ở tương lai **không được cache** — `resolveGrants` trả thẳng kết quả và query lại ở request sau. V1 chưa cho đặt `valid_to` tương lai (`UserRoleAssignmentDto` không có field này), nhánh đó là rào cho tương lai.

## Permission và scope cho FE

`GET /me` trả `permissions`, `scopes` và `permissionVersion`. FE dùng `permissionVersion` làm cache key để dựng menu/navigation.

`@RequirePermissions` đồng thời xuất quyền của operation ra OpenAPI dưới `x-required-permissions`
(ngữ nghĩa AND, giống `PermissionGuard`). Admin đọc contract để kiểm tra độ phủ quyền bằng test,
thay vì chép tay permission code.

**SECURITY:** menu ẩn không phải là kiểm soát truy cập. Mọi endpoint vẫn phải khai báo `@RequirePermissions`; FE chỉ ẩn thứ người dùng không dùng được.

`ScopeType` hiện chỉ có `GLOBAL` và `BRANCH`. Cột `user_role_assignments.warehouse_id` tồn tại nhưng chưa có scope type tương ứng và không được map vào `AuthPrincipal` — muốn dùng phải thêm `ScopeType.WAREHOUSE`, cập nhật `AuthScopeDto` và các service đang lọc theo scope.

## Error contract

- `401` token sai/hết hạn, session bị revoke, `pv` lệch, sai mật khẩu.
- `403` `PASSWORD_CHANGE_REQUIRED` khi `mustChangePassword` còn true và endpoint yêu cầu permission.
- `AUTH_ERROR.ACCOUNT_LOCKED` sau 5 lần sai mật khẩu liên tiếp; khoá atomic bằng `$queryRaw` và revoke toàn bộ session.

## Test

`auth.service.spec.ts` phủ khoá tài khoản, reset sau login thành công, cache grant theo version, rebuild khi version đổi và từ chối `pv` lệch. Đây là unit test với Prisma mock — **chưa** có bằng chứng PostgreSQL integration cho khoá atomic.

## Checklist khi sửa

1. Đổi `AuthPrincipal`/`CurrentUserDto` ⇒ chạy `yarn openapi:generate` và đồng bộ SDK FE.
2. Đổi cách resolve quyền ⇒ kiểm tra `PermissionGuard` và mọi service đang đọc `request.auth.scopes`.
3. Thêm scope type ⇒ cập nhật cả `AuthScopeDto`, `ScopeType` và tài liệu DB theo rule `08`.
