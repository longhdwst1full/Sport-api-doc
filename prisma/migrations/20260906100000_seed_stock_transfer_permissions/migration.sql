BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:seed_stock_transfer_permissions'));

WITH desired(code, module, action, description, is_sensitive) AS (
  VALUES
    ('inventory.transfer.view', 'inventory', 'transfer.view', 'View stock transfers visible to the assigned branch scope', false),
    ('inventory.transfer.create', 'inventory', 'transfer.create', 'Create and submit stock transfers from an assigned source branch', true),
    ('inventory.transfer.ship', 'inventory', 'transfer.ship', 'Ship stock transfers from an assigned source branch', true),
    ('inventory.transfer.receive', 'inventory', 'transfer.receive', 'Receive stock transfers into an assigned destination branch', true)
)
INSERT INTO public.permissions (code, module, action, description, is_sensitive)
SELECT code, module, action, description, is_sensitive
FROM desired
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM public.roles role
CROSS JOIN public.permissions permission
WHERE role.code IN ('OWNER', 'BRANCH_MANAGER')
  AND permission.code IN (
    'inventory.transfer.view',
    'inventory.transfer.create',
    'inventory.transfer.ship',
    'inventory.transfer.receive'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- The permission set changed. Invalidate existing role-holder tokens once when this
-- migration is deployed so their next login receives the new permission claims.
UPDATE public.users target
SET permission_version = target.permission_version + 1,
    version = target.version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE target.id IN (
  SELECT DISTINCT assignment.user_id
  FROM public.user_role_assignments assignment
  JOIN public.roles role ON role.id = assignment.role_id
  WHERE role.code IN ('OWNER', 'BRANCH_MANAGER')
    AND assignment.status = 'ACTIVE'
    AND assignment.valid_from <= CURRENT_TIMESTAMP
    AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP)
);

COMMIT;
