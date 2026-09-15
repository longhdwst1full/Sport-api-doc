BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:checkout_session_payment_methods'));

-- Hai migration trước chỉ nới ràng buộc phương thức trên `payments`, bỏ sót `checkout_sessions`.
-- Hệ quả đã quan sát được: tạo đơn tại quầy (CASH) vỡ ở bước tạo phiên checkout, và
-- checkout VNPAY trên storefront cũng sẽ vỡ ở đúng chỗ đó vì VNPAY chưa từng được thêm.
-- Giữ đúng tập phương thức đang hợp lệ ở `payments`: BANK_TRANSFER, COD, VNPAY, CASH.
ALTER TABLE public.checkout_sessions DROP CONSTRAINT IF EXISTS checkout_sessions_payment_method_check;
ALTER TABLE public.checkout_sessions ADD CONSTRAINT checkout_sessions_payment_method_check CHECK (
  payment_method IN ('BANK_TRANSFER', 'COD', 'VNPAY', 'CASH'));

COMMIT;
