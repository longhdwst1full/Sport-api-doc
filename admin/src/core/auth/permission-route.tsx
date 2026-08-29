import { Result } from 'antd';
import type { ReactNode } from 'react';
import { useCan } from './permissions';

export function PermissionRoute({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const allowed = useCan(permission);
  if (allowed) return children;

  return (
    <Result
      status="403"
      title="Bạn không có quyền truy cập"
      subTitle={`Quyền cần thiết: ${permission}`}
    />
  );
}
