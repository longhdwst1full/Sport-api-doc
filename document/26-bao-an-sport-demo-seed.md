# Bảo An Sport demo seed

> **Document version:** 1.3.0
>
> **Last updated:** 2026-09-26
>
> **Change summary:** Chủ dự án cho phép dùng nguyên văn nội dung baoansport.vn; thêm `db:catalog:enrich` (không phá huỷ) bổ sung mô tả, thương hiệu, thông số, gallery và 20 bài viết.

## Phạm vi

- Nguồn tham khảo: `https://baoansport.vn` và 16 trang chi tiết sản phẩm công khai.
- Dữ liệu lấy theo thời điểm 2026-09-06: tên model, giá bán hiển thị, ảnh đại diện và URL nguồn.
- ~~Mô tả ngắn trong hệ thống được biên soạn lại; không sao chép mô tả dài của website nguồn.~~ Thay bởi quyết
  định 2026-09-26: chủ dự án cho phép dùng **nguyên văn** mô tả sản phẩm và bài viết của baoansport.vn (giữ
  `sourceUrl` để truy vết). Xem mục "Bổ sung dữ liệu từ web".
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

## Reset catalog demo (SEED-20260925-CATALOG-RESET)

Chỉ dùng cho môi trường demo/đồ án, theo quyết định của chủ dự án ngày 2026-09-25.

```bash
yarn db:catalog:reset --confirm-destructive-reset
```

- Nguồn: `prisma/demo-data/catalog-demo.json`, snapshot ngày 2026-09-25 của catalog crawl. Gồm 2 sản phẩm tốt nhất mỗi danh mục lá (ưu tiên có thương hiệu thật, nhiều thông số, nhiều ảnh): 95 sản phẩm, 20 thương hiệu, 380 ảnh.
- Trước khi xoá luôn ghi backup JSON của mọi bảng bị xoá vào `.backups/pre-catalog-reset-*.json`.
- Xoá: catalog (sản phẩm, SKU, giá, media link, danh mục, thương hiệu, thuộc tính), tồn kho, giỏ/checkout, đơn, thanh toán, fulfillment, phiếu trả, review, flash sale; outbox chưa gửi của đơn/phiếu trả.
- Giữ: kho/chi nhánh, user/phân quyền, khách hàng, audit log, `media_assets` (ảnh Cloudinary dùng lại theo `publicId`), bài viết (bỏ slug sản phẩm không còn).
- Thông số: ~150 nhãn crawl gom về 28 thuộc tính TEXT; nhãn không map và bảng gốc giữ trong `seoJson`. Cân nặng và kích thước kiện của SKU chỉ lấy khi parse chắc chắn.
- Tồn: 10–30 mỗi SKU tại mỗi kho `ACTIVE`, cố định theo hash SKU + kho, ghi qua phiếu `OPENING_BALANCE` và movement `ADJUST`. Đây là số demo, không phải tồn thật.
- Ảnh Cloudinary của sản phẩm bị xoá không bị script này xoá; dọn riêng sau khi kiểm tra không còn tham chiếu.
- Ba bảng sổ cái `payment_transactions`, `fulfillment_status_history`, `inventory_movements` có trigger chặn DELETE. Chủ dự án tự tắt trigger trong Supabase SQL editor trước khi chạy và bật lại ngay sau đó; script không tự tắt trigger. `audit_logs` không bị xoá.
- Lần chạy 2026-09-25 10:11 UTC: 95 sản phẩm, 20 thương hiệu, 60 danh mục, 28 thuộc tính, 190 movement; backup `.backups/pre-catalog-reset-2026-09-25T10-07-45-421Z.json`.

## Bổ sung dữ liệu từ web (SEED-20260926-CATALOG-ENRICH)

```bash
yarn db:catalog:enrich --confirm-manual-seed
```

- Nguồn: trang chi tiết của 95 sản phẩm trong `catalog-demo.json` và 20 URL trong `https://baoansport.vn/sitemap-post.xml`
  (robots.txt cho phép), crawl ngày 2026-09-26. Kết quả lưu ở `catalog-demo.json` (sản phẩm) và `content-demo.json` (bài viết).
- Sản phẩm: mô tả dài nguyên văn (văn bản thuần, tiêu đề là dòng riêng, gạch đầu dòng `•`), thương hiệu theo khối
  "Thương hiệu" của trang (thêm 7 hãng; 4 sản phẩm đổi hãng so với crawl cũ), bảng thông số + Xuất xứ/Bảo hành
  (thêm thuộc tính `ORIGIN`, `WARRANTY`), gallery thật. Bộ ảnh cũ lẫn banner quảng cáo và ảnh "Sản phẩm cùng loại"
  của sản phẩm khác đã được thay. 83/95 sản phẩm trên web chỉ có 1 ảnh.
- Cân nặng/kích thước chỉ điền khi SKU còn trống và parse chắc chắn; 37/95 SKU vẫn 0g vì web ghi "Đang cập nhật".
- Bài viết: thân bài theo quy ước `## `/`### `/`- ` của storefront; `postType` theo chuyên mục (chính sách → POLICY,
  tư vấn thiết bị → PRODUCT_GUIDE, kiến thức thể thao → TRAINING_GUIDE, thông báo → NEWS). Sản phẩm liên quan: slug được
  bài link tới nếu có trong catalog, bổ sung theo danh mục cụ thể nhất bài link tới (tối đa 4).
- Không phá huỷ: cập nhật theo `product_no` / `sku` / `code` / `slug`; không đụng đơn, tồn, giỏ, giá, review. Bài viết không
  thuộc snapshot giữ nguyên. Luôn backup `.backups/pre-catalog-enrich-*.json` trước khi ghi; chạy lại cho cùng kết quả.
- Lần chạy 2026-09-26 14:43 UTC: 95 sản phẩm, 27 hãng, +2 thuộc tính, +11 ảnh, 1 bài tạo mới, 19 bài cập nhật; backup
  `.backups/pre-catalog-enrich-2026-09-26T14-43-06-655Z.json`. Chạy lần 2 không tạo thêm bản ghi.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.3.0 | 2026-09-26 | Cho phép nội dung nguyên văn từ web; thêm enrich không phá huỷ và 20 bài viết. |
| 1.2.0 | 2026-09-25 | Thêm reset catalog demo từ snapshot crawl, backup bắt buộc và tồn demo. |
| 1.1.0 | 2026-09-06 | Manual-only guard, create-only mặc định, scoped price và Cloudinary reuse. |
| 1.0.0 | 2026-09-06 | Tạo manifest và quy tắc import 16 sản phẩm Bảo An Sport. |
