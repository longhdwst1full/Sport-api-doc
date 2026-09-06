# Bảo An Sport demo seed

> **Document version:** 1.1.0
>
> **Last updated:** 2026-09-06
>
> **Change summary:** Khóa seed ở chế độ manual-only; mặc định create-only và tái sử dụng ảnh Cloudinary.

## Phạm vi

- Nguồn tham khảo: `https://baoansport.vn` và 16 trang chi tiết sản phẩm công khai.
- Dữ liệu lấy theo thời điểm 2026-09-06: tên model, giá bán hiển thị, ảnh đại diện và URL nguồn.
- Mô tả ngắn trong hệ thống được biên soạn lại; không sao chép mô tả dài của website nguồn.
- Đây là dữ liệu demo phục vụ phát triển/QA, không phải feed thương mại và không tự đồng bộ giá về sau.
- Ảnh được Cloudinary fetch vào folder `<CLOUDINARY_FOLDER>/demo/bao-an-sport`; metadata giữ URL nguồn để truy vết.

## Danh mục và số lượng

| Nhóm | Số sản phẩm |
| --- | ---: |
| Máy chạy bộ | 4 |
| Ghế tập tạ | 4 |
| Dụng cụ võ thuật | 4 |
| Dụng cụ bóng bàn | 4 |
| **Tổng từ Bảo An Sport** | **16** |
| Demo có sẵn | 4 |
| **Tổng catalog sau seed** | **20** |

## Quy tắc idempotency

- Product upsert theo `product_no`; variant theo `sku`; brand/category theo `code`.
- Bản ghi đã tồn tại được giữ nguyên theo mặc định, bao gồm dữ liệu Admin đã chỉnh sửa.
- Giá chỉ xét đúng scope `REGULAR + ONLINE + VND + ACTIVE`; không ghi đè nếu đã tồn tại.
- Balance và opening movement chỉ được tạo ở lần đầu; chạy lại không cộng thêm tồn.
- Cloudinary dùng public ID cố định theo slug; asset đã tồn tại được tái sử dụng, không upload lại.
- Manifest fail-fast nếu trùng brand/category code, slug, product number hoặc SKU.

## Chính sách thực thi

- Demo seed không được gọi bởi `start`, `build`, migration runner hoặc deployment.
- Chỉ chạy thủ công sau khi người phụ trách yêu cầu và xác nhận rõ phạm vi.
- `--refresh-data` cho phép ghi đè dữ liệu demo đã tồn tại.
- `--refresh-media` cho phép tải và upload đè ảnh nguồn.
- Hai cờ refresh không được sử dụng ngầm trong CI/CD hoặc startup.

## Lệnh chạy và kiểm tra

```bash
yarn db:seed:demo --confirm-manual-seed
```

Không có `--confirm-manual-seed`, script dừng trước khi kết nối Cloudinary hoặc ghi database.
Lệnh không tự chạy foundation seed; nếu thiếu bootstrap OWNER, cần chạy `yarn db:seed` riêng
sau khi được xác nhận.
Lần seed dữ liệu Bảo An ban đầu đã hoàn tất ngày 2026-09-06; không chạy lại nếu không có
yêu cầu mới của người phụ trách.

Sau khi chạy cần kiểm tra tổng 20 product demo, 16 media Cloudinary nguồn Bảo An và reconciliation `on_hand = SUM(quantity_delta)`.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.1.0 | 2026-09-06 | Manual-only guard, create-only mặc định, scoped price và Cloudinary reuse. |
| 1.0.0 | 2026-09-06 | Tạo manifest và quy tắc import 16 sản phẩm Bảo An Sport. |
