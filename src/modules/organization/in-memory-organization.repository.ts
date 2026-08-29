import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OrganizationRepository } from './organization.repository';
import { Branch, BranchWithWarehouse, Warehouse } from './organization.types';
import { MutationContext } from '../../common/request/request-context';

@Injectable()
export class InMemoryOrganizationRepository extends OrganizationRepository {
  private readonly hcmBranchId = randomUUID();
  private readonly hanoiBranchId = randomUUID();

  private readonly branches: Branch[] = [
    {
      id: this.hcmBranchId,
      code: 'CN-HCM-01',
      name: 'Chi nhánh Hồ Chí Minh',
      status: 'ACTIVE',
      phone: '028 7300 8899',
      email: 'hcm@dctd.vn',
      address: {
        addressLine: '123 Nguyễn Văn Linh',
        district: 'Quận 7',
        province: 'TP. Hồ Chí Minh',
      },
      timezone: 'Asia/Ho_Chi_Minh',
      version: 0,
    },
    {
      id: this.hanoiBranchId,
      code: 'CN-HN-01',
      name: 'Chi nhánh Hà Nội',
      status: 'ACTIVE',
      address: {
        addressLine: '88 Duy Tân',
        district: 'Cầu Giấy',
        province: 'Hà Nội',
      },
      timezone: 'Asia/Ho_Chi_Minh',
      version: 0,
    },
  ];

  private readonly warehouses: Warehouse[] = [
    {
      id: randomUUID(),
      branchId: this.hcmBranchId,
      code: 'KHO-HCM-01',
      name: 'Kho bán hàng Hồ Chí Minh',
      status: 'ACTIVE',
      isPrimary: true,
      version: 0,
    },
    {
      id: randomUUID(),
      branchId: this.hanoiBranchId,
      code: 'KHO-HN-01',
      name: 'Kho bán hàng Hà Nội',
      status: 'ACTIVE',
      isPrimary: true,
      version: 0,
    },
  ];

  listBranches(): Promise<Branch[]> {
    return Promise.resolve(this.branches.map((branch) => ({ ...branch, address: { ...branch.address } })));
  }

  listWarehouses(): Promise<Warehouse[]> {
    return Promise.resolve(this.warehouses.map((warehouse) => ({ ...warehouse })));
  }

  hasBranchCode(code: string): Promise<boolean> {
    return Promise.resolve(this.branches.some((branch) => branch.code === code));
  }

  hasWarehouseCode(code: string): Promise<boolean> {
    return Promise.resolve(this.warehouses.some((warehouse) => warehouse.code === code));
  }

  hasActiveBranch(id: string): Promise<boolean> {
    return Promise.resolve(this.branches.some((branch) => branch.id === id && branch.status === 'ACTIVE'));
  }

  hasActiveWarehouse(id: string): Promise<boolean> {
    return Promise.resolve(this.warehouses.some((warehouse) => warehouse.id === id && warehouse.status === 'ACTIVE'));
  }

  saveBranchWithWarehouse(
    branch: Branch,
    warehouse: Warehouse,
    context: MutationContext,
  ): Promise<BranchWithWarehouse> {
    this.branches.push({ ...branch, address: { ...branch.address } });
    this.warehouses.push({ ...warehouse });
    void context;
    return Promise.resolve({
      branch: { ...branch, address: { ...branch.address } },
      warehouse: { ...warehouse },
    });
  }
}
