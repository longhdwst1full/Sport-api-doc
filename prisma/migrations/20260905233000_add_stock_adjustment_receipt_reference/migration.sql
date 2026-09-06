BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:add_stock_adjustment_receipt_reference'));

ALTER TABLE public.stock_adjustments
  ADD COLUMN external_reference VARCHAR(100),
  ADD COLUMN source_name VARCHAR(255);

CREATE UNIQUE INDEX stock_adjustments_manual_receipt_reference_uq
  ON public.stock_adjustments (warehouse_id, external_reference)
  WHERE adjustment_type = 'MANUAL_RECEIPT' AND external_reference IS NOT NULL;

COMMIT;
