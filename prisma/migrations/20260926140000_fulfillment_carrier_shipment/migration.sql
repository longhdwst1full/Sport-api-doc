BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:fulfillment_carrier_shipment'));

-- Vận đơn GHN tự tạo sau khi đơn đủ điều kiện giao (trả trước: payment SUCCESS; COD: Admin xác nhận đơn).
-- Cờ nằm trên chính fulfillment và được đặt trong cùng transaction với sự kiện kích hoạt, nên không mất
-- yêu cầu khi tiến trình chết; worker gọi hãng NGOÀI transaction rồi ghi kết quả.
-- NULL = không áp dụng (đơn không báo giá qua GHN, POS, đơn cũ) và giữ nguyên luồng tạo vận đơn lúc ship.
ALTER TABLE public.fulfillments
  ADD COLUMN carrier_shipment_status VARCHAR(24),
  ADD COLUMN carrier_shipment_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN carrier_shipment_next_attempt_at TIMESTAMPTZ(6),
  ADD COLUMN carrier_shipment_locked_at TIMESTAMPTZ(6),
  ADD COLUMN carrier_shipment_error VARCHAR(500),
  ADD CONSTRAINT fulfillments_carrier_shipment_status_check
    CHECK (carrier_shipment_status IS NULL OR carrier_shipment_status IN ('PENDING', 'CREATING', 'CREATED', 'CREATE_FAILED')),
  ADD CONSTRAINT fulfillments_carrier_shipment_attempts_check CHECK (carrier_shipment_attempts >= 0),
  ADD CONSTRAINT fulfillments_carrier_shipment_created_check
    CHECK (carrier_shipment_status IS DISTINCT FROM 'CREATED' OR tracking_no IS NOT NULL);

-- Worker chỉ quét dòng đang chờ/đang tạo; partial index giữ index nhỏ vì đa số dòng là NULL/CREATED.
CREATE INDEX fulfillments_carrier_shipment_due_idx
  ON public.fulfillments (carrier_shipment_next_attempt_at, id)
  WHERE carrier_shipment_status IN ('PENDING', 'CREATING');

COMMIT;
