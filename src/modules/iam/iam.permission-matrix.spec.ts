import { PERMISSION_CATALOG, V1_ROLE_PERMISSIONS } from './iam.permissions';

describe('V1 complete role-permission matrix', () => {
  const branchManagerPermissions = [
    'org.branch.view',
    'org.warehouse.view',
    'iam.user.view',
    'customer.view',
    'customer.manage',
    'catalog.brand.view',
    'catalog.category.view',
    'catalog.product.view',
    'catalog.price.view',
    'review.moderate',
    'inventory.stock.view',
    'inventory.stock.adjust',
    'inventory.stocktake.manage',
    'inventory.transfer.view',
    'inventory.transfer.create',
    'inventory.transfer.ship',
    'inventory.transfer.receive',
    'order.view',
    'order.manage',
    'payment.view',
    'payment.confirm',
    'fulfillment.view',
    'fulfillment.pick',
    'fulfillment.pack',
    'fulfillment.ship',
    'return.view',
    'return.decide',
    'return.receive',
    'report.operation.view',
    'report.revenue.view',
    'report.inventory.view',
  ];
  const staffPermissions = [
    'org.branch.view',
    'org.warehouse.view',
    'customer.view',
    'catalog.brand.view',
    'catalog.category.view',
    'catalog.product.view',
    'catalog.price.view',
    'inventory.stock.view',
    'inventory.stocktake.manage',
    'order.view',
    'order.manage',
    'fulfillment.view',
    'fulfillment.pick',
    'fulfillment.pack',
    'fulfillment.ship',
    'return.view',
    'return.receive',
  ];

  it('grants OWNER the complete catalog without duplicates', () => {
    const catalogCodes = PERMISSION_CATALOG.map(({ code }) => code);

    expect(V1_ROLE_PERMISSIONS.OWNER).toEqual(catalogCodes);
    expect(new Set(catalogCodes).size).toBe(catalogCodes.length);
  });

  it('keeps the BRANCH_MANAGER permission set exact', () => {
    expect(V1_ROLE_PERMISSIONS.BRANCH_MANAGER).toEqual(branchManagerPermissions);
  });

  it('keeps the STAFF permission set exact', () => {
    expect(V1_ROLE_PERMISSIONS.STAFF).toEqual(staffPermissions);
  });

  it('never assigns an unknown permission code to a system role', () => {
    const knownCodes = new Set(PERMISSION_CATALOG.map(({ code }) => code));

    for (const permissions of Object.values(V1_ROLE_PERMISSIONS)) {
      expect(permissions.every((code) => knownCodes.has(code))).toBe(true);
      expect(new Set(permissions).size).toBe(permissions.length);
    }
  });
});
