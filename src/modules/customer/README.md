# Customer module

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-18
>
> **Change summary:** Mô tả ranh giới nghiệp vụ, quyền, phạm vi dữ liệu và invariant của Customer.

## Phạm vi

Module quản lý hồ sơ khách hàng, địa chỉ giao hàng và góc nhìn quản trị về lịch sử mua. Nó không
sở hữu vòng đời đơn hàng, thanh toán hoặc tồn kho; các module đó chỉ tham chiếu `customer_id`.

- `AdminCustomerController`: danh sách, chi tiết, tạo độc lập, cập nhật, ngừng/mở lại và xóa hồ sơ.
- `CustomerController`: hồ sơ và địa chỉ của khách đang đăng nhập.
- Bảng chính: `customers`, `customer_addresses`; dữ liệu tổng hợp đọc thêm từ `orders`.
- Thay đổi nhạy cảm ghi vào `audit_logs` trong cùng transaction với mutation.

## Quyền và phạm vi

| Vai trò | Đọc | Quản lý | Phạm vi |
| --- | --- | --- | --- |
| OWNER | Có | Có | GLOBAL |
| BRANCH_MANAGER | Có | Có | Các khách đã phát sinh đơn tại chi nhánh được gán |
| STAFF | Có | Không | Các khách đã phát sinh đơn tại chi nhánh được gán |

`customer.view` bảo vệ API đọc; `customer.manage` bảo vệ mutation. Backend luôn là nguồn quyết
định, việc ẩn nút trên Admin chỉ phục vụ UX.

Khách hàng không có `branch_id`; phạm vi chi nhánh được suy ra qua đơn hàng. Vì vậy API tạo hồ sơ
độc lập chỉ nhận principal `GLOBAL`. Nhân viên chi nhánh tạo khách qua POS/đơn hàng để hồ sơ và
chi nhánh được liên kết trong đúng luồng nghiệp vụ, tránh tạo xong nhưng không thể đọc lại.

## Invariant

- `name` sau trim phải có giá trị.
- Luôn còn ít nhất một kênh liên hệ: email hoặc số điện thoại.
- Email/SĐT được chuẩn hóa trước khi kiểm tra unique; SĐT lưu ở dạng E.164.
- `MEMBER` (đã liên kết tài khoản) không được hard delete.
- Khách đã có đơn không được hard delete; dùng `INACTIVE` để giữ lịch sử.
- Update/lifecycle/delete dùng `expectedVersion` để phát hiện hai người sửa cùng lúc.
- Audit mutation không chép tên, email hoặc số điện thoại; chỉ lưu ID, trạng thái, version và danh
  sách trường thay đổi.

## Cache và contract

NestJS decorator/DTO là API producer. Sau khi đổi contract phải generate OpenAPI rồi regenerate
Admin SDK; không sửa `src/generated/api` bằng tay. Mutation Admin phải invalidate danh sách và
chi tiết tương ứng; delete phải loại detail khỏi cache.

## Checklist khi sửa

- [ ] Kiểm tra `customer.view`/`customer.manage` và branch scope ở backend.
- [ ] Giữ invariant email hoặc SĐT ở server, không chỉ ở form.
- [ ] Mutation và audit chạy cùng transaction.
- [ ] Không đưa PII thô vào audit/log/error.
- [ ] Thêm test permission, scope, optimistic version và contact invariant.
- [ ] Cập nhật OpenAPI, Admin SDK và tài liệu trace trong cùng task.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-18 | Tạo maintenance note cho CRUD, permission, scope, invariant và audit. |
