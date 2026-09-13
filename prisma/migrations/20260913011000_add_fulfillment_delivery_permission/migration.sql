BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:add_fulfillment_delivery_permission'));

INSERT INTO public.permissions (code, module, action, description, is_sensitive)
VALUES (
  'fulfillment.delivery_update',
  'Fulfillment',
  'delivery_update',
  'Xác nhận giao thành công, giao thất bại và nhận hàng hoàn về kho',
  true
)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM public.roles role
CROSS JOIN public.permissions permission
WHERE role.code IN ('OWNER', 'BRANCH_MANAGER', 'STAFF')
  AND permission.code = 'fulfillment.delivery_update'
ON CONFLICT (role_id, permission_id) DO NOTHING;

UPDATE public.users target
SET permission_version = target.permission_version + 1,
    version = target.version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE target.id IN (
  SELECT DISTINCT assignment.user_id
  FROM public.user_role_assignments assignment
  JOIN public.roles role ON role.id = assignment.role_id
  WHERE role.code IN ('OWNER', 'BRANCH_MANAGER', 'STAFF')
    AND assignment.status = 'ACTIVE'
    AND assignment.valid_from <= CURRENT_TIMESTAMP
    AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP)
);

COMMIT;
