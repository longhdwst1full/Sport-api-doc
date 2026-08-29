import { ConflictException } from '@nestjs/common';
import { InMemoryOrganizationRepository } from './in-memory-organization.repository';
import { OrganizationService } from './organization.service';

describe('OrganizationService', () => {
  const context = { requestId: 'unit-request', actorUserId: 'unit-actor' };
  const input = {
    code: 'CN-DN-01',
    name: 'Chi nhánh Đà Nẵng',
    address: { addressLine: '12 Bạch Đằng', district: 'Hải Châu', province: 'Đà Nẵng' },
    warehouse: { code: 'KHO-DN-01', name: 'Kho bán hàng Đà Nẵng' },
  };

  it('creates one branch and exactly one primary warehouse', async () => {
    const service = new OrganizationService(new InMemoryOrganizationRepository());
    const result = await service.createBranch(input, context);

    expect(result.warehouse.branchId).toBe(result.branch.id);
    expect(result.warehouse.isPrimary).toBe(true);
    expect(
      (await service.listWarehouses()).items.filter((item) => item.branchId === result.branch.id),
    ).toHaveLength(1);
  });

  it('rejects duplicate branch and warehouse business codes', async () => {
    const service = new OrganizationService(new InMemoryOrganizationRepository());
    await service.createBranch(input, context);
    await expect(service.createBranch(input, context)).rejects.toThrow(ConflictException);
  });

  it('serves active branch and warehouse lookups with backend search', async () => {
    const service = new OrganizationService(new InMemoryOrganizationRepository());
    const branchResult = await service.searchActiveBranches({ search: 'hcm', page: 1, limit: 20 });
    const warehouseResult = await service.searchActiveWarehouses({
      search: 'kho',
      page: 1,
      limit: 20,
      branchId: branchResult.items[0]?.id,
    });

    expect(branchResult.items).toHaveLength(1);
    expect(warehouseResult.items).toHaveLength(1);
    expect(warehouseResult.meta.hasMore).toBe(false);
  });
});
