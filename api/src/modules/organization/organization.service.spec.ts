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

  it('updates a branch and its single warehouse with optimistic versions', async () => {
    const service = new OrganizationService(new InMemoryOrganizationRepository());
    const branch = (await service.listBranches()).items[0];
    const warehouse = (await service.listWarehouses()).items.find(
      (item) => item.branchId === branch.id,
    );
    expect(warehouse).toBeDefined();

    const result = await service.updateBranch(
      branch.id,
      {
        name: 'Chi nhánh Hồ Chí Minh mới',
        address: branch.address,
        warehouse: { name: 'Kho Hồ Chí Minh mới' },
        expectedVersion: branch.version,
        warehouseExpectedVersion: warehouse!.version,
      },
      context,
    );

    expect(result.branch.name).toBe('Chi nhánh Hồ Chí Minh mới');
    expect(result.warehouse.name).toBe('Kho Hồ Chí Minh mới');
    expect(result.branch.version).toBe(branch.version + 1);
    expect(result.warehouse.version).toBe(warehouse!.version + 1);
  });

  it('rejects stale organization updates without partially changing branch or warehouse', async () => {
    const service = new OrganizationService(new InMemoryOrganizationRepository());
    const branch = (await service.listBranches()).items[0];
    const warehouse = (await service.listWarehouses()).items.find(
      (item) => item.branchId === branch.id,
    );
    await expect(
      service.updateBranch(
        branch.id,
        {
          name: 'Tên không được lưu',
          address: branch.address,
          warehouse: { name: 'Kho không được lưu' },
          expectedVersion: branch.version + 1,
          warehouseExpectedVersion: warehouse!.version,
        },
        context,
      ),
    ).rejects.toThrow(ConflictException);

    expect((await service.listBranches()).items[0].name).toBe(branch.name);
    expect(
      (await service.listWarehouses()).items.find((item) => item.branchId === branch.id)?.name,
    ).toBe(warehouse!.name);
  });

  it('deactivates and reactivates a branch together with its warehouse', async () => {
    const service = new OrganizationService(new InMemoryOrganizationRepository());
    const branch = (await service.listBranches()).items[0];
    const warehouse = (await service.listWarehouses()).items.find(
      (item) => item.branchId === branch.id,
    );
    const inactive = await service.changeBranchStatus(
      branch.id,
      'INACTIVE',
      {
        expectedVersion: branch.version,
        warehouseExpectedVersion: warehouse!.version,
      },
      context,
    );
    expect(inactive.branch.status).toBe('INACTIVE');
    expect(inactive.warehouse.status).toBe('INACTIVE');

    const active = await service.changeBranchStatus(
      branch.id,
      'ACTIVE',
      {
        expectedVersion: inactive.branch.version,
        warehouseExpectedVersion: inactive.warehouse.version,
      },
      context,
    );
    expect(active.branch.status).toBe('ACTIVE');
    expect(active.warehouse.status).toBe('ACTIVE');
  });
});
