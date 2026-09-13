BEGIN;

-- fulfillment_no is deterministically derived from immutable order_no in V1.
-- Keep no independent counter that could drift or imply a second numbering source.
DROP SEQUENCE IF EXISTS public.fulfillment_number_seq;

COMMIT;
