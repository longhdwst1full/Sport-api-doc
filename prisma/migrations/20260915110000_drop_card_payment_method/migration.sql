BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:drop_card_payment_method'));

-- Cửa hàng không dùng máy quẹt thẻ POS, nên bỏ CASH-kề `CARD` vừa thêm ở migration trước.
-- Migration tiến-một-chiều: không sửa bản đã áp, thêm bản mới thu hẹp ràng buộc.
-- An toàn vì chưa có payment nào mang giá trị này (đã kiểm trước khi viết).
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check CHECK (
  method IN ('BANK_TRANSFER', 'COD', 'VNPAY', 'CASH'));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_expiry_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_expiry_check CHECK (
  (method IN ('BANK_TRANSFER', 'VNPAY') AND (status <> 'PENDING' OR expires_at IS NOT NULL))
  OR method IN ('COD', 'CASH'));

COMMIT;
