-- Tham số chứa bí mật tích hợp (token GHN, hash secret VNPay, token Mailtrap...).
--
-- Cờ này quyết định giá trị có được trả ra API đọc hay không. Không có nó thì mọi tài khoản có
-- quyền xem tham số đều đọc được khoá của nhà cung cấp, và khoá sẽ nằm trong log của mọi proxy
-- giữa đường.
ALTER TABLE system_parameters ADD COLUMN is_secret BOOLEAN NOT NULL DEFAULT FALSE;

-- Bí mật không bao giờ được công khai cho Storefront, kể cả khi ai đó lỡ bật is_public.
ALTER TABLE system_parameters
  ADD CONSTRAINT system_parameters_secret_not_public_check
  CHECK (NOT (is_secret AND is_public));
