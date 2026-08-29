import { describe, expect, it } from 'vitest';
import { createPermissionSet, shouldBypassPermissions } from './permissions';

describe('admin development permission bypass', () => {
  it('allows every permission only when development bypass is enabled', () => {
    const permissions = createPermissionSet('catalog.product.view', true);

    expect(permissions.has('catalog.product.view')).toBe(true);
    expect(permissions.has('future.module.manage')).toBe(true);
  });

  it('uses the explicit permission list when bypass is disabled', () => {
    const permissions = createPermissionSet(' catalog.product.view, inventory.stock.view ', false);

    expect(permissions.has('catalog.product.view')).toBe(true);
    expect(permissions.has('inventory.stock.view')).toBe(true);
    expect(permissions.has('catalog.product.manage')).toBe(false);
  });

  it('defaults to open in development and always stays closed in production', () => {
    expect(shouldBypassPermissions(true)).toBe(true);
    expect(shouldBypassPermissions(true, 'false')).toBe(false);
    expect(shouldBypassPermissions(false, 'true')).toBe(false);
  });
});
