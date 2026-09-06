# Bảo An Sport demo seed

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-06
>
> **Change summary:** Bổ sung 16 sản phẩm tham khảo từ Bảo An Sport vào demo seed, nâng catalog demo lên 20 sản phẩm.

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
- Giá hiện tại được update thay vì tạo thêm price window trùng.
- Balance và opening movement chỉ được tạo ở lần đầu; chạy lại không cộng thêm tồn.
- Cloudinary dùng public ID cố định theo slug; `media_assets` được tìm theo provider + public ID và product media được tái sử dụng.

## Lệnh chạy và kiểm tra

```bash
yarn db:seed:demo
```

Sau khi chạy cần kiểm tra tổng 20 product demo, 16 media Cloudinary nguồn Bảo An và reconciliation `on_hand = SUM(quantity_delta)`.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-06 | Tạo manifest và quy tắc import 16 sản phẩm Bảo An Sport. |
