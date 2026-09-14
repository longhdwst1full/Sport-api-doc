BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:vnpay_payment_method'));

-- 1. Cho phép phương thức VNPAY.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check CHECK (
  method IN ('BANK_TRANSFER', 'COD', 'VNPAY'));

-- 2. VNPAY có cửa sổ thanh toán giống chuyển khoản: đang PENDING thì bắt buộc có hạn.
--    COD không có hạn vì tiền thu khi giao hàng.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_expiry_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_expiry_check CHECK (
  (method IN ('BANK_TRANSFER', 'VNPAY') AND (status <> 'PENDING' OR expires_at IS NOT NULL))
  OR method = 'COD');

-- 3. Actor hệ thống cho các xác nhận do máy thực hiện.
--
--    `payments_confirmation_check` bắt buộc confirmed_by khi status = SUCCESS. IPN của
--    VNPay không có người duyệt, nên cần một chủ thể đại diện hệ thống thay vì nới lỏng
--    ràng buộc — nới lỏng sẽ mất luôn khả năng truy vết ai đã xác nhận tiền.
--    Tài khoản này không đăng nhập được: password_hash để trống và status là INACTIVE
--    xét theo đăng nhập, nhưng vẫn tham chiếu được từ khoá ngoại.
--    `normalized_email` không có unique constraint nên dùng chèn có điều kiện
--    thay cho ON CONFLICT; chạy lại migration cũng không tạo bản ghi thứ hai.
INSERT INTO public.users (user_type, email, normalized_email, password_hash, display_name,
                          status, permission_version, must_change_password,
                          created_at, updated_at)
SELECT 'SYSTEM', 'system@dctd.local', 'system@dctd.local', '',
       'Hệ thống', 'INACTIVE', 1, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE normalized_email = 'system@dctd.local'
);

COMMIT;
