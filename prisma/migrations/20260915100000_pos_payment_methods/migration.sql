BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:pos_payment_methods'));

-- Bán tại quầy thu tiền ngay, không phải COD (COD là thu hộ khi giao hàng).
-- Tách CASH và CARD để đối soát quỹ và đối soát máy POS ngân hàng về sau không lẫn nhau.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check CHECK (
  method IN ('BANK_TRANSFER', 'COD', 'VNPAY', 'CASH', 'CARD'));

-- CASH/CARD thu ngay tại quầy nên không có cửa sổ chờ thanh toán.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_expiry_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_expiry_check CHECK (
  (method IN ('BANK_TRANSFER', 'VNPAY') AND (status <> 'PENDING' OR expires_at IS NOT NULL))
  OR method IN ('COD', 'CASH', 'CARD'));

-- Kênh bán KHÔNG đổi: ràng buộc sẵn có đã cho 'STORE' cho đơn bán tại cửa hàng.
-- Đơn tại quầy dùng lại giá trị này thay vì đẻ thêm từ vựng trùng nghĩa.

COMMIT;
