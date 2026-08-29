import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import {
  BranchDto,
  BranchListDto,
  BranchWithWarehouseDto,
  CreateBranchDto,
  WarehouseDto,
  WarehouseListDto,
} from './organization.dto';

@Injectable()
export class OrganizationService {
  private readonly hcmBranchId = randomUUID();
  private readonly hanoiBranchId = randomUUID();

  private readonly branches: BranchDto[] = [
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

  private readonly warehouses: WarehouseDto[] = [
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

  listBranches(): BranchListDto {
    return { items: this.branches.map((branch) => ({ ...branch })), total: this.branches.length };
  }

  listWarehouses(): WarehouseListDto {
    return {
      items: this.warehouses.map((warehouse) => ({ ...warehouse })),
      total: this.warehouses.length,
    };
  }

  createBranch(input: CreateBranchDto): BranchWithWarehouseDto {
    if (this.branches.some((branch) => branch.code === input.code)) {
      throw new ConflictException('Branch code already exists');
    }
    if (this.warehouses.some((warehouse) => warehouse.code === input.warehouse.code)) {
      throw new ConflictException('Warehouse code already exists');
    }

    const branch: BranchDto = {
      id: randomUUID(),
      code: input.code,
      name: input.name,
      status: 'ACTIVE',
      phone: input.phone,
      email: input.email,
      address: { ...input.address },
      timezone: 'Asia/Ho_Chi_Minh',
      version: 0,
    };
    const warehouse: WarehouseDto = {
      id: randomUUID(),
      branchId: branch.id,
      code: input.warehouse.code,
      name: input.warehouse.name,
      status: 'ACTIVE',
      isPrimary: true,
      version: 0,
    };

    this.branches.push(branch);
    this.warehouses.push(warehouse);
    return { branch: { ...branch }, warehouse: { ...warehouse } };
  }

  hasBranch(branchId: string): boolean {
    return this.branches.some((branch) => branch.id === branchId && branch.status === 'ACTIVE');
  }

  hasWarehouse(warehouseId: string): boolean {
    return this.warehouses.some(
      (warehouse) => warehouse.id === warehouseId && warehouse.status === 'ACTIVE',
    );
  }
}
