# Đánh giá hiệu năng đọc API

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-18
>
> **Change summary:** Ghi baseline production, tối ưu đọc danh sách sản phẩm và giới hạn kết luận khi chưa có số liệu PostgreSQL.

## Baseline đọc-only

Ngày 2026-09-18, từ môi trường làm việc gọi `https://sport-api-doc.vercel.app` bằng `curl` (mỗi lần một request, không dùng account):

| Operation | Kết quả | TTFB quan sát |
| --- | --- | --- |
| `GET /api/v1/health` | 200 | khoảng 1,28–1,46 giây |
| `GET /api/v1/catalog/products?page=1&limit=8` | 200 | khoảng 2,28–2,45 giây |

`health` cũng mất hơn một giây nên không thể quy toàn bộ độ trễ cho SQL catalog. Số đo này gồm internet, Vercel function, ứng dụng và Supabase; **không phải** p95/p99 và chưa tách cold start với pooler/DB.

## Thay đổi có bằng chứng trong source

`ProductsService.list` và danh sách SKU trước đây dùng `$transaction([findMany, count])` cho hai phép đọc độc lập. Transaction làm tăng thời gian giữ connection đến database ở xa; ở READ COMMITTED nó cũng không bảo đảm hai truy vấn dùng một snapshot chung. Chuyển sang `Promise.all` để cho phép chạy đồng thời, giữ nguyên `items` và `meta` của API. `relationLoadStrategy: 'join'` đã có từ trước, không thay đổi. Test unit xác nhận danh sách sản phẩm không mở transaction.

## Cần đo tiếp sau deploy

- Thu TTFB/p50/p95 của health, catalog list và Admin list trên cùng region trong ít nhất 24 giờ; so sánh trước/sau bằng cùng tải.
- Lấy slow query từ Supabase Logs/`pg_stat_statements`; dùng `EXPLAIN (ANALYZE, BUFFERS)` cho truy vấn thật trước khi thêm index mới.
- Kiểm tra connection pressure của Vercel ↔ Supabase pooler và Nest bootstrap khi cold start. Không tăng pool size hoặc thêm index chỉ dựa vào TTFB ở trên.
- Admin `listUsers` hiện trả toàn bộ nhân viên; cần chốt contract phân trang nếu dữ liệu tăng lớn. `findUser` còn gọi `listUsers` rồi lọc trong bộ nhớ — đã ghi nhận để sửa riêng vì chạm luồng lock/unlock và revoke assignment.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-18 | Baseline và tối ưu danh sách sản phẩm; danh sách phép đo DB cần thu thêm. |
