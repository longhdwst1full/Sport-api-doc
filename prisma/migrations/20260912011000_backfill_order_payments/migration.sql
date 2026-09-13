BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:backfill_order_payments'));

ALTER TABLE public.payment_transactions DROP CONSTRAINT payment_transactions_type_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_type_check
  CHECK (transaction_type IN ('CREATED', 'EVIDENCE_SUBMITTED', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COD_COLLECTED', 'EXPIRED'));
ALTER TABLE public.payment_transactions DROP CONSTRAINT payment_transactions_status_check;
ALTER TABLE public.payment_transactions ADD CONSTRAINT payment_transactions_status_check
  CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'NEED_REVIEW', 'CANCELLED'));

-- Historical SUCCESS/REFUNDED rows require an actor/reference reconciliation;
-- silently fabricating these would violate the financial audit invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders customer_order
    LEFT JOIN public.payments payment ON payment.order_id = customer_order.id
    WHERE payment.id IS NULL
      AND customer_order.payment_status IN ('SUCCESS', 'REFUNDED')
  ) THEN
    RAISE EXCEPTION 'Historical paid/refunded orders require explicit payment reconciliation before this migration';
  END IF;
END $$;

WITH inserted AS (
  INSERT INTO public.payments (
    order_id, payment_ref, method, status, expected_amount, received_amount,
    currency_code, expires_at, failure_reason, created_at, updated_at
  )
  SELECT
    customer_order.id,
    'PAY-' || customer_order.order_no,
    checkout.payment_method,
    customer_order.payment_status,
    customer_order.grand_total,
    0,
    customer_order.currency_code,
    CASE WHEN checkout.payment_method = 'BANK_TRANSFER'
      THEN customer_order.placed_at + INTERVAL '30 minutes'
      ELSE NULL
    END,
    CASE WHEN customer_order.payment_status = 'FAILED'
      THEN 'Dữ liệu được chuyển từ Order trước khi có Payment aggregate'
      ELSE NULL
    END,
    customer_order.created_at,
    CURRENT_TIMESTAMP
  FROM public.orders customer_order
  JOIN public.checkout_sessions checkout ON checkout.id = customer_order.checkout_session_id
  LEFT JOIN public.payments payment ON payment.order_id = customer_order.id
  WHERE payment.id IS NULL
  RETURNING id, order_id, expected_amount, currency_code, created_at
)
INSERT INTO public.payment_transactions (
  payment_id, transaction_type, provider, idempotency_key, request_hash,
  amount, currency_code, status, raw_payload_redacted, occurred_at
)
SELECT
  inserted.id,
  'CREATED',
  CASE WHEN checkout.payment_method = 'COD' THEN 'INTERNAL_COD' ELSE 'MANUAL_BANK_TRANSFER' END,
  'payment-bootstrap:' || inserted.order_id,
  md5('payment-bootstrap:' || inserted.order_id) || md5('payment-bootstrap-hash:' || inserted.order_id),
  inserted.expected_amount,
  inserted.currency_code,
  'PENDING',
  '{"source":"ORDER_PAYMENT_BACKFILL"}'::jsonb,
  inserted.created_at
FROM inserted
JOIN public.orders customer_order ON customer_order.id = inserted.order_id
JOIN public.checkout_sessions checkout ON checkout.id = customer_order.checkout_session_id;

COMMIT;
