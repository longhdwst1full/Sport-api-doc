/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from 'react';

const PermissionContext = createContext<Set<string>>(new Set());

export function PermissionProvider({ children }: { children: ReactNode }) {
  const permissions = new Set<string>(
    (import.meta.env.VITE_DEV_PERMISSIONS ?? '').split(',').filter(Boolean),
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
