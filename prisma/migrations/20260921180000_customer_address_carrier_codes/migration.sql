-- Sổ địa chỉ khách trước đây chỉ lưu mã tỉnh/thành, còn quận/huyện và phường/xã lưu tên chữ.
-- Hãng vận chuyển định tuyến bằng MÃ quận/phường, nên địa chỉ đã lưu không tạo được vận đơn mà
-- phải chọn lại từ đầu; báo giá cũng không tính được cho tới khi có đủ mã.
ALTER TABLE "public"."customer_addresses"
  ADD COLUMN "ward_code" VARCHAR(32),
  ADD COLUMN "district_code" VARCHAR(32),
  ADD COLUMN "province" VARCHAR(255),
  -- Mã địa giới chỉ có nghĩa trong hệ thống của hãng cấp ra nó. Không ghi lại hãng nào thì sau này
  -- đổi/chạy song song hãng khác sẽ gửi mã của hãng này sang hãng kia mà không ai phát hiện.
  ADD COLUMN "code_provider" VARCHAR(32);

-- Dữ liệu cũ không có mã quận/phường: để NULL thay vì đoán. Địa chỉ nào thiếu mã thì luồng tạo vận
-- đơn đã có sẵn lỗi "thiếu mã quận/huyện hoặc phường/xã của GHN" và người dùng chọn lại.
COMMENT ON COLUMN "public"."customer_addresses"."code_provider" IS 'Hãng vận chuyển cấp bộ mã địa giới, ví dụ GHN';
