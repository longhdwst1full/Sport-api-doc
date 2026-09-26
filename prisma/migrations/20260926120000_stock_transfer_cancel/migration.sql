BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:stock_transfer_cancel'));

-- Phiếu tạo nhầm trước đây nằm vĩnh viễn ở DRAFT/SUBMITTED. CANCELLED chỉ đạt được trước SHIPPED:
-- submit chưa giữ tồn nên huỷ không phát sinh movement; sau SHIPPED hàng đã rời kho, phải nhận rồi xử lý bù.
ALTER TABLE public.stock_transfers
  ADD COLUMN cancelled_by BIGINT,
  ADD COLUMN cancelled_at TIMESTAMPTZ(6),
  ADD COLUMN cancel_reason TEXT,
  ADD CONSTRAINT stock_transfers_cancelled_by_fkey FOREIGN KEY (cancelled_by)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public.stock_transfers
  DROP CONSTRAINT stock_transfers_status_check,
  ADD CONSTRAINT stock_transfers_status_check
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'SHIPPED', 'RECEIVED', 'CANCELLED'));

ALTER TABLE public.stock_transfers
  DROP CONSTRAINT stock_transfers_state_timestamps_check,
  ADD CONSTRAINT stock_transfers_state_timestamps_check CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL AND shipped_at IS NULL AND received_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'SUBMITTED' AND submitted_at IS NOT NULL AND shipped_at IS NULL AND received_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'SHIPPED' AND submitted_at IS NOT NULL AND shipped_at IS NOT NULL AND shipped_by IS NOT NULL AND received_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'RECEIVED' AND submitted_at IS NOT NULL AND shipped_at IS NOT NULL AND shipped_by IS NOT NULL AND received_at IS NOT NULL AND received_by IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED' AND shipped_at IS NULL AND received_at IS NULL
        AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND NULLIF(BTRIM(cancel_reason), '') IS NOT NULL)
  );

COMMIT;
