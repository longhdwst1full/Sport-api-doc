BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:normalize_stock_transfer_permission_metadata'));

UPDATE public.permissions
SET module = 'Inventory',
    action = CASE code
      WHEN 'inventory.transfer.view' THEN 'view'
      WHEN 'inventory.transfer.create' THEN 'create'
      WHEN 'inventory.transfer.ship' THEN 'ship'
      WHEN 'inventory.transfer.receive' THEN 'receive'
    END
WHERE code IN (
  'inventory.transfer.view',
  'inventory.transfer.create',
  'inventory.transfer.ship',
  'inventory.transfer.receive'
);

COMMIT;
