# Customer module

> **Document version:** 2.0.0
>
> **Last updated:** 2026-09-21
>
> **Change summary:** Email và SĐT thành bắt buộc trên hồ sơ; thêm ảnh đại diện (`avatar_asset_id`) và đồng bộ địa chỉ nguyên trạng ngay trong create/update khách.

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

## Transaction

Địa chỉ ghi trong **cùng transaction** với hồ sơ. Ở `update`, địa chỉ chỉ được ghi sau khi
`updateMany` đã thắng `expectedVersion` — version của `customers` là khoá chung cho cả hồ sơ lẫn sổ
địa chỉ, nên hai người sửa song song không trộn địa chỉ vào nhau.

## Invariant

- `name` sau trim phải có giá trị.
- Hồ sơ do Admin tạo/sửa phải có **cả** email và số điện thoại. Trước 2026-09-21 chỉ cần một trong
  hai và gửi chuỗi rỗng là xoá; contract mới không còn xoá liên hệ bằng chuỗi rỗng — đây là thay đổi
  phá vỡ tương thích, ghi tại `API-20260921-CUSTOMER-AVATAR-ADDRESSES` trong `11-model-change-log.json`.
- Mỗi khách có đúng một địa chỉ mặc định khi danh sách địa chỉ không rỗng; không đánh dấu thì địa chỉ
  đầu tiên được chọn.
- `avatar_asset_id` chỉ nhận media asset đang `ACTIVE`; xoá asset chỉ làm mất ảnh (`ON DELETE SET NULL`).
- Email/SĐT được chuẩn hóa trước khi kiểm tra unique; SĐT lưu ở dạng E.164.
- `addresses` gửi kèm create/update là **trạng thái mong muốn cuối cùng**: có `id` là cập nhật, không
  `id` là thêm mới, địa chỉ cũ vắng mặt chuyển `INACTIVE` (không xoá cứng, vì đơn cũ còn tham chiếu).
  Bỏ trống trường này nghĩa là không đụng tới địa chỉ.
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
