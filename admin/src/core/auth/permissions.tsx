/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';

class PermissionSet extends Set<string> {
  constructor(
    permissions: Iterable<string>,
    private readonly allowAll: boolean,
  ) {
    super(permissions);
  }

  override has(permission: string): boolean {
    return this.allowAll || super.has(permission);
  }
}

export function shouldBypassPermissions(isDevelopment: boolean, flag?: string): boolean {
  return isDevelopment && (flag ?? 'true') === 'true';
}

export function createPermissionSet(
  rawPermissions: string,
  allowAll: boolean,
): ReadonlySet<string> {
  const permissions = rawPermissions
    .split(',')
    .map((permission) => permission.trim())
    .filter(Boolean);
  return new PermissionSet(permissions, allowAll);
}

const PermissionContext = createContext<ReadonlySet<string>>(new Set());

export function PermissionProvider({ children }: { children: ReactNode }) {
  const permissions = createPermissionSet(
    import.meta.env.VITE_DEV_PERMISSIONS ?? '',
    shouldBypassPermissions(import.meta.env.DEV, import.meta.env.VITE_DEV_BYPASS_PERMISSIONS),
  );
  return <PermissionContext.Provider value={permissions}>{children}</PermissionContext.Provider>;
}

export function useCan(permission: string): boolean {
  return useContext(PermissionContext).has(permission);
}

export function usePermissions(): ReadonlySet<string> {
  return useContext(PermissionContext);
}

export function PermissionGate({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  return useCan(permission) ? children : null;
}
