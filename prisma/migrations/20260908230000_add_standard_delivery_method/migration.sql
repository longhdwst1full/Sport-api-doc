BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:add_standard_delivery_method'));

ALTER TABLE public.checkout_sessions
  DROP CONSTRAINT checkout_sessions_shipping_method_check,
  ADD CONSTRAINT checkout_sessions_shipping_method_check CHECK (
    shipping_method IN ('BRANCH_FREE', 'STANDARD_DELIVERY', 'THIRD_PARTY', 'MANUAL_EXTERNAL')
  );

COMMIT;
