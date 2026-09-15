BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:branch_address_province_code'));

-- Đơn bán tại quầy lấy địa chỉ chi nhánh làm địa chỉ nhận. Snapshot địa chỉ của đơn
-- (`order.service.addressSnapshot`) bắt buộc có `provinceCode`, nhưng `branches.address_json`
-- chưa bao giờ mang trường này nên không đơn tại quầy nào tạo được.
-- Mã dùng ở đây là mã đơn vị hành chính cấp tỉnh của Tổng cục Thống kê (Hà Nội 01,
-- TP. Hồ Chí Minh 79, Đà Nẵng 48). Nếu hệ thống vận chuyển dùng bộ mã khác, sửa bằng
-- một migration tiến-một-chiều mới thay vì sửa file này.
UPDATE public.branches
SET address_json = address_json || jsonb_build_object('provinceCode', v.code),
    updated_at = CURRENT_TIMESTAMP
FROM (VALUES
  ('Hà Nội', '01'),
  ('TP. Hồ Chí Minh', '79'),
  ('Đà Nẵng', '48')
) AS v(province, code)
WHERE address_json->>'province' = v.province
  AND address_json->>'provinceCode' IS NULL;

COMMIT;
