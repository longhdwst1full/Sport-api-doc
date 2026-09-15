# Trạng thái bàn giao — nguồn tiến độ duy nhất

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-15
>
> **Change summary:** Tạo nguồn tiến độ duy nhất; các tài liệu sprint cũ đóng băng và trỏ về đây.

## Tài liệu này dùng để làm gì

Trước đây mỗi sprint tự khai tiến độ trong tài liệu riêng. Khi việc của sprint sau hoàn thành
nốt phần còn thiếu của sprint trước, không ai quay lại sửa, nên tài liệu cũ giữ mãi con số lỗi
thời và mất khả năng trace.

Từ nay:

- **Chỉ tài liệu này khai tiến độ.** Tài liệu sprint giữ lại làm hồ sơ thiết kế và quyết định
  kỹ thuật, không còn là nguồn trạng thái.
- Mọi khẳng định ở đây phải kèm bằng chứng kiểm được bằng lệnh hoặc truy vấn.
- Mục nào chưa kiểm được thì ghi rõ **chưa kiểm chứng**, không đoán.

## Phân biệt hai loại "xong"

| Loại | Nghĩa |
| --- | --- |
| **Xong trong mã nguồn** | Code, test, migration, tài liệu đã có trong repo |
| **Đã bật trên môi trường chạy** | Cần chủ dự án cấu hình: cron, khoá bí mật, deploy |

Một tính năng có thể xong trong mã nguồn nhưng chưa bật trên môi trường chạy. Hai cột này
không được gộp làm một.

## Trạng thái theo khối chức năng

| Khối | Mã nguồn | Môi trường chạy | Bằng chứng |
| --- | --- | --- | --- |
| Nền tảng dữ liệu, ID BIGINT | ✅ | ✅ | 54 migration đã apply; không migration nào treo |
| Catalog thật | ✅ | ✅ | 596 sản phẩm, 61 danh mục |
| Bài viết và chính sách | ✅ | ✅ | 10 bài thật + 9 trang chính sách |
| Giỏ hàng, checkout, đặt hàng | ✅ | ✅ | Đơn thật chạy trọn luồng |
| Giữ hàng và hết hạn giữ hàng | ✅ | ⚠️ Cần bật cron | Có worker + `reservation-expiry.integration-spec.ts`; configurator `scripts/configure-reservation-expiry-cron.cjs` |
| Giao vận | ✅ | ✅ | Chuỗi PICKING → DELIVERED chạy thật |
| Thanh toán VNPay | ✅ | ⚠️ Chờ khoá | Backend + IPN + trang kết quả; khoá SMTP/VNPay do chủ dự án cấp |
| Bán tại quầy | ✅ | ✅ | `ORD-20260915-00000025`, `...26` |
| Flash sale + quota | ✅ | ⚠️ Cần bật cron | `test/flash-sale-quota.integration-spec.ts` — 6 test trên PostgreSQL thật |
| Báo cáo và Dashboard | ✅ | ✅ | 4 endpoint `Admin Reporting` |
| Quản lý khách hàng | ✅ | ✅ | `Admin Customers`; fixture đã xoá |
| Vai trò và phân quyền | ✅ | ✅ | CRUD + cây quyền |
| Tồn kho | ✅ | ✅ | Sổ Hà Nội mở, đã nhập và bán thật |
| E2E trình duyệt | ✅ | ⚠️ Chưa gắn CI | `client/e2e/storefront-smoke.spec.ts`, `product-search.spec.ts` |
| Đổi trả và hoàn tiền | ❌ | ❌ | `grep -c "model Return\|model Refund"` → `0` |
| Thông báo và email | ❌ | ❌ | Chưa có model `Notification`, chưa có Nodemailer |
| Bảo hành | ❌ | ❌ | Chưa có model `Warranty` |

## Việc còn lại

Danh sách chi tiết kèm checklist nằm ở `client/_plans/close-out-v1.md`. Tóm tắt:

| Mã | Việc | Ước lượng |
| --- | --- | --- |
| B1 | Đồng bộ trạng thái tài liệu | 0.5 ngày |
| B2 | Sửa soft-404 trên route động | 0.5 ngày |
| B3 | Chuẩn hoá thông báo lỗi sang tiếng Việt | 1 ngày |
| B4 | Notification + gửi email | 2–3 ngày |
| B5 | Vật lý hoá Outbox + retry/dead-letter | 1–2 ngày |
| B6 | Export báo cáo CSV/XLSX | 1 ngày |
| B7 | PWA: icon PNG, cài đặt được | 0.5–1 ngày |
| B8 | Giảm bundle Admin | 0.5 ngày |
| B9 | Đồng bộ giỏ hàng nhiều thiết bị | 1–2 ngày |
| R2 | Đổi trả → Kiểm tra → Hoàn tiền | 5–7 ngày |

## Việc của chủ dự án

- Bật cron trên Supabase cho giữ hàng hết hạn và quota flash sale
- Cấp khoá SMTP (cho B4) và khoá VNPay production
- Redeploy `admin` và `api`
- Xác nhận 7 cam kết marketing đang hiển thị trên storefront
- Gắn bộ E2E vào CI nếu muốn chặn hồi quy tự động

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-15 | Tạo nguồn tiến độ duy nhất. |
