# Media module maintenance note

> **Document version:** 1.0.0
>
> **Last updated:** 2026-09-25
>
> **Change summary:** Tạo note; thêm job dọn ảnh bằng chứng mồ côi trên Cloudinary (dry-run mặc định).

## Phạm vi

- `media.controller.ts` / `media.service.ts`: ký upload, xác minh và quản lý `media_assets` (ảnh sản phẩm,
  brand, category, CMS…).
- `orphan-cleanup/`: dọn ảnh **bằng chứng** đã upload nhưng không bao giờ được gắn vào nghiệp vụ.

## Job dọn ảnh mồ côi

- Endpoint nội bộ `GET /api/v1/internal/jobs/media/orphans` (Bearer `CRON_SECRET`, không thuộc OpenAPI).
  Mặc định `DRY_RUN` chỉ trả báo cáo; `?mode=delete` mới xoá.
- Chỉ quét `<CLOUDINARY_FOLDER>/payment-evidence/`, `/return-evidence/`, `/refund-proof/`. Không bao giờ
  quét ảnh sản phẩm/brand/category hay toàn tài khoản.
- Ứng viên: ảnh cũ hơn 24 giờ và không có trong `media_assets.public_id`,
  `return_requests.evidence_images[].publicId`, `refunds.proof_images[].publicId` (chỉ đọc các bảng này).
- DELETE: tối đa 100 ảnh/lượt; kiểm lại tham chiếu ngay trước khi xoá; ghi audit `media.orphan.delete`
  (actor SYSTEM) **trước** khi gọi Cloudinary; lỗi provider được báo trong `failed`, không dừng cả lô.
- Ảnh mồ côi không có dòng DB nên không có trạng thái PENDING_DELETE; audit là dấu vết duy nhất.
- Chưa đăng ký cron. Dry-run thật ngày 2026-09-25: 0 ảnh trong 3 thư mục (chưa có bằng chứng nào được
  upload). Đăng ký lịch DRY_RUN khi đã có dữ liệu, duyệt báo cáo rồi mới bật delete.

## Checklist khi sửa

- Thêm nơi lưu ảnh bằng chứng mới → bổ sung vào `referencedPublicIds`, nếu không ảnh đang dùng sẽ bị xoá.
- Không mở rộng danh sách thư mục sang ảnh sản phẩm khi chưa có đối soát tham chiếu tương ứng.

## Revision history

| Version | Date | Change summary |
| --- | --- | --- |
| 1.0.0 | 2026-09-25 | Tạo note và job dọn ảnh bằng chứng mồ côi. |
