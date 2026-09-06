BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:reconcile_missing_opening_movements'));

DO $$
DECLARE
  bootstrap_actor_id BIGINT;
BEGIN
  SELECT id INTO bootstrap_actor_id
  FROM public.users
  WHERE normalized_email = 'bootstrap-admin@example.invalid'
  ORDER BY id
  LIMIT 1;

  IF bootstrap_actor_id IS NULL AND EXISTS (
    SELECT 1
    FROM public.inventory_balances balance
    LEFT JOIN public.inventory_movements movement
      ON movement.warehouse_id = balance.warehouse_id
     AND movement.product_variant_id = balance.product_variant_id
    GROUP BY balance.id, balance.on_hand
    HAVING balance.on_hand <> COALESCE(SUM(movement.quantity_delta), 0)
  ) THEN
    RAISE EXCEPTION 'Cannot reconcile inventory opening balance without bootstrap actor';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_balances balance
    LEFT JOIN public.inventory_movements movement
      ON movement.warehouse_id = balance.warehouse_id
     AND movement.product_variant_id = balance.product_variant_id
    GROUP BY balance.id, balance.on_hand
    HAVING balance.on_hand - COALESCE(SUM(movement.quantity_delta), 0) < 0
  ) THEN
    RAISE EXCEPTION 'Negative inventory reconciliation gap; refusing automatic repair';
  END IF;

  INSERT INTO public.inventory_movements (
    warehouse_id,
    product_variant_id,
    movement_type,
    quantity_delta,
    balance_after,
    reference_type,
    reference_id,
    idempotency_key,
    reason,
    occurred_at,
    created_by
  )
  SELECT
    balance.warehouse_id,
    balance.product_variant_id,
    'RECEIVE',
    balance.on_hand - COALESCE(SUM(movement.quantity_delta), 0),
    balance.on_hand - COALESCE(SUM(movement.quantity_delta), 0),
    'MIGRATION_OPENING_RECONCILIATION',
    balance.id::text,
    'migration-opening-reconciliation:' || balance.id::text,
    'Bổ sung movement mở sổ cho tồn demo lịch sử',
    COALESCE(MIN(movement.occurred_at) - INTERVAL '1 microsecond', balance.updated_at),
    bootstrap_actor_id
  FROM public.inventory_balances balance
  LEFT JOIN public.inventory_movements movement
    ON movement.warehouse_id = balance.warehouse_id
   AND movement.product_variant_id = balance.product_variant_id
  GROUP BY balance.id, balance.warehouse_id, balance.product_variant_id,
           balance.on_hand, balance.updated_at
  HAVING balance.on_hand - COALESCE(SUM(movement.quantity_delta), 0) > 0
  ON CONFLICT (idempotency_key) DO NOTHING;
END $$;

COMMIT;
