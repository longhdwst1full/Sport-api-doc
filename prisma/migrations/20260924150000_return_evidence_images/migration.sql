-- Ảnh minh chứng phiếu trả: đổi `evidence_urls` (link tự do) thành `evidence_images` (ảnh đã xác minh),
-- và thêm `refunds.proof_images` để lưu chứng từ hoàn tiền phục vụ đối chiếu.
--
-- Link tự do cho phép gắn bất kỳ URL nào, link chết làm mất bằng chứng và cửa hàng không kiểm được ảnh
-- có phải ảnh chụp món hàng hay không. Giờ khách tải ảnh lên Cloudinary bằng chữ ký cấp riêng cho đơn,
-- server xác minh rồi mới ghi vào cột này. Không tạo bảng riêng theo quyết định của chủ dự án.

-- Chặn mất dữ liệu: chỉ đổi khi chưa phiếu nào dùng cột cũ. Kiểm ngày 2026-09-24: 0 phiếu.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "return_requests" WHERE "evidence_urls" IS NOT NULL) THEN
    RAISE EXCEPTION 'return_requests.evidence_urls còn dữ liệu; chuyển đổi trước khi đổi cột';
  END IF;
END $$;

ALTER TABLE "return_requests" RENAME COLUMN "evidence_urls" TO "evidence_images";

ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_evidence_images_check"
  CHECK ("evidence_images" IS NULL OR (jsonb_typeof("evidence_images") = 'array' AND jsonb_array_length("evidence_images") <= 5));

-- Chứng từ hoàn tiền (ảnh biên lai/màn hình chuyển khoản) lưu cùng lượt hoàn khi Admin xác nhận, để
-- đối chiếu về sau với sao kê: số tiền, external_ref, processed_at, processed_by và ảnh nằm trên một dòng.
ALTER TABLE "refunds" ADD COLUMN "proof_images" JSONB;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_proof_images_check"
  CHECK ("proof_images" IS NULL OR (jsonb_typeof("proof_images") = 'array' AND jsonb_array_length("proof_images") <= 5));
