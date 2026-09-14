BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dctd:seed_system_parameter_permissions'));

-- Hai quyền này đã có trong PERMISSION_CATALOG nhưng chưa từng được seed vào bảng
-- permissions, nên không vai trò nào cấp được và màn tham số hệ thống chỉ mở ra
-- nhờ bypass ở môi trường phát triển.
INSERT INTO public.permissions (code, module, action, description, is_sensitive)
VALUES
  ('system.parameter.view', 'System', 'view', 'Xem tham số nghiệp vụ của hệ thống', false),
  ('system.parameter.manage', 'System', 'manage', 'Sửa giá trị tham số nghiệp vụ, có hiệu lực ngay', true)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_sensitive = EXCLUDED.is_sensitive;

-- Chỉ OWNER: đổi tham số nghiệp vụ ảnh hưởng toàn hệ thống, không phải việc của chi nhánh.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM public.roles role
CROSS JOIN public.permissions permission
WHERE role.code = 'OWNER'
  AND permission.code IN ('system.parameter.view', 'system.parameter.manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

UPDATE public.users target
SET permission_version = target.permission_version + 1,
    version = target.version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE target.id IN (
  SELECT DISTINCT assignment.user_id
  FROM public.user_role_assignments assignment
  JOIN public.roles role ON role.id = assignment.role_id
  WHERE role.code = 'OWNER'
    AND assignment.status = 'ACTIVE'
    AND assignment.valid_from <= CURRENT_TIMESTAMP
    AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP)
);

COMMIT;
