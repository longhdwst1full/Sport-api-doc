# System Parameters — maintenance note

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-22
>
> **Change summary:** Làm rõ ranh giới: cờ bật/tắt worker vào bảng, bí mật của worker ở lại env.

## Vì sao có bảng này

Trước đây mọi ngưỡng nghiệp vụ nằm ở env theo quyết định **D45** (`30-sprint-4-execution-plan.md` mục 3: *"Không thêm bảng `system_settings`; TTL/hold/timeout kỹ thuật dùng env đã validate"*).

Vấn đề thực tế: đổi biểu phí giao hàng hay thời gian giữ đơn phải redeploy. Vận hành không tự làm được.

Quyết định mới: **ngưỡng nghiệp vụ chuyển sang bảng, bí mật và cấu hình hạ tầng giữ ở env.**

## Ranh giới bảng và env — đọc trước khi thêm tham số

| Vào bảng | Ở lại env |
| --- | --- |
| Biểu phí giao hàng, bán kính miễn phí | `DATABASE_URL`, `JWT_ACCESS_SECRET` |
| TTL giữ chỗ, thời gian chờ hoàn tất đơn | Khoá Cloudinary, GHN |
| Hạn thanh toán, TTL giỏ khách vãng lai | `AUTH_BYPASS`, `CORS_ORIGINS` |
| TTL giữ suất flash sale | `CRON_SECRET` và mọi bí mật khác |
| Bật/tắt worker, batch size của worker | `*_JOB_URL`, `*_CRON_SCHEDULE` (lịch nằm ở Supabase Cron) |

Đưa bí mật vào bảng nghĩa là cho sửa cấu hình bảo mật qua giao diện và mở rộng bề mặt tấn công.

**Cờ bật/tắt worker thuộc về bảng, không thuộc env.** Khi worker gây sự cố, vận hành cần dừng nó
trong vài giây; nếu cờ nằm ở env thì phải redeploy, và trong lúc chờ thì sự cố vẫn chạy. Riêng
secret của endpoint worker ở lại env vì đổi được khoá từ giao diện là mở rộng bề mặt tấn công.
Hệ quả phải chấp nhận: tham số có thể bật trong khi env thiếu secret — endpoint khi đó **từ chối
401**, không phải 500.

## Hai loại tham số

| | `isSystem = true` | `isSystem = false` |
| --- | --- | --- |
| Nguồn | `SYSTEM_PARAMETER_CATALOG` trong code | Admin tự tạo |
| Code đọc theo mã | Có | Không |
| Sửa giá trị | ✅ | ✅ |
| Đổi mã / xoá | ❌ chặn ở service | ✅ xoá mềm |

Tham số hệ thống không xoá được vì service sẽ âm thầm rơi về mặc định — lỗi khó phát hiện nhất.

## Kế thừa từ `fund-ops-service`

Tham chiếu: `msttparameter`, `ParameterResource` (`/api/v1/broker/mst/parameters`).

| Điểm kế thừa | Áp dụng tại đây |
| --- | --- |
| `group_category` gom nhóm | `groupCode` với 6 nhóm |
| `param_name` / `type` / `value` / `remarks` | `code` / `valueType` / `value` / `remarks` |
| `@Version` optimistic lock | `version` + `expectedVersion` bắt buộc khi ghi |
| `page` / `size` / `sort` | `page` / `limit` / `sortBy` + `sortDirection` |
| Lọc theo nhóm, tên, trạng thái | `groupCode`, `search`, `status`, `isSystem` |
| Whitelist tham số công khai | Cờ `isPublic` **trên bản ghi** thay vì danh sách trong file cấu hình — danh sách trong config bị lệch khi rolling update |
| Cache + invalidate sau khi commit | Cache trong tiến trình TTL 30s, xoá ngay sau mỗi lần ghi |
| Xoá mềm | Chuyển `status = INACTIVE`, giữ vết audit |

**Chưa kế thừa:** luồng duyệt (`ApprovalStatus`, `ref_id`, edit copy, approve/reject theo lô). Bên đó mọi thay đổi tham số phải qua người duyệt. Cân nhắc khi áp quy tắc "STAFF tạo thì chờ OWNER/BRANCH_MANAGER duyệt" cho Sprint 6.

## Hành vi phòng thủ

- Thiếu bản ghi, giá trị hỏng, hoặc database chưa bật ⇒ rơi về `defaultValue` trong catalog. **Cấu hình sai không được làm sập luồng bán hàng.**
- Kiểm tra kiểu và khoảng min/max **trước khi mở transaction**.
- `sortBy` đi qua whitelist, không ghép chuỗi từ query vào `orderBy`.
- Lý do thao tác là tuỳ chọn. Nếu không nhập, `remarks` để trống; audit vẫn lưu actor, request-id và thay đổi (bí mật luôn bị che).
- Catalog tự đồng bộ lúc khởi động (`onModuleInit`); lỗi chỉ ghi log, không chặn app.

## Operation

| Operation | Quyền |
| --- | --- |
| `listPublicSystemParameters` | Public, chỉ trả bản ghi `isPublic` |
| `listAdminSystemParameters` | `system.parameter.view` |
| `createAdminSystemParameter`, `updateAdminSystemParameter`, `deleteAdminSystemParameter` | `system.parameter.manage` |

## Checklist khi sửa

- [ ] Thêm tham số mới: khai báo trong `SYSTEM_PARAMETER_CATALOG`, không `INSERT` tay.
- [ ] Không đưa bí mật vào bảng này.
- [ ] Mọi consumer phải chịu được giá trị thiếu hoặc hỏng.
- [ ] Ghi vào cột actor dùng `toActorDatabaseId`, không dùng `toOptionalDatabaseId`.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-14 | Tạo bảng tham số, kế thừa pattern `msttparameter` của fund-ops-service. |
| 1.0.1 | 2026-09-18 | Cho phép bỏ trống lý do khi sửa/ngừng dùng, không bỏ audit. |
| 1.1.0 | 2026-09-22 | Cờ bật/tắt và batch size của worker chuyển vào bảng; bí mật worker ở lại env. |
