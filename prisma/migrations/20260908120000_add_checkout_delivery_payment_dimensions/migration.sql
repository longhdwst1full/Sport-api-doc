BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:add_checkout_delivery_payment_dimensions'));

ALTER TABLE public.checkout_sessions
  ADD COLUMN payment_method VARCHAR(24) NOT NULL DEFAULT 'BANK_TRANSFER',
  ADD COLUMN shipping_method VARCHAR(32) NOT NULL DEFAULT 'MANUAL_EXTERNAL',
  ADD COLUMN shipping_provider VARCHAR(32),
  ADD COLUMN provider_quote_ref VARCHAR(150),
  ADD COLUMN distance_km DECIMAL(10,2),
  ADD COLUMN customer_note VARCHAR(1000);

ALTER TABLE public.checkout_sessions
  ALTER COLUMN status TYPE VARCHAR(40),
  DROP CONSTRAINT checkout_sessions_status_check,
  ADD CONSTRAINT checkout_sessions_status_check CHECK (
    status IN ('AWAITING_SHIPPING_CONSULTATION', 'QUOTED', 'CONFIRMED', 'EXPIRED', 'COMPLETED', 'CANCELLED')
  ),
  ADD CONSTRAINT checkout_sessions_payment_method_check CHECK (
    payment_method IN ('BANK_TRANSFER', 'COD')
  ),
  ADD CONSTRAINT checkout_sessions_shipping_method_check CHECK (
    shipping_method IN ('BRANCH_FREE', 'THIRD_PARTY', 'MANUAL_EXTERNAL')
  ),
  ADD CONSTRAINT checkout_sessions_distance_check CHECK (
    distance_km IS NULL OR distance_km >= 0
  ),
  ADD CONSTRAINT checkout_sessions_provider_shape_check CHECK (
    (shipping_method = 'THIRD_PARTY' AND shipping_provider IS NOT NULL)
    OR shipping_method <> 'THIRD_PARTY'
  );

CREATE INDEX checkout_sessions_payment_method_status_idx
  ON public.checkout_sessions(payment_method, status);
CREATE INDEX checkout_sessions_shipping_method_status_idx
  ON public.checkout_sessions(shipping_method, status);

REVOKE ALL ON TABLE public.checkout_sessions FROM anon, authenticated;
ALTER TABLE public.checkout_sessions ENABLE ROW LEVEL SECURITY;

COMMIT;
