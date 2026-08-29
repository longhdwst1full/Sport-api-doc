import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import {
  ActiveLookupResponseDto,
  ActiveSearchQueryDto,
  ActiveWarehouseSearchQueryDto,
  buildActiveLookupResponse,
} from '../../common/pagination/active-search.dto';
import {
  BranchListDto,
  BranchWithWarehouseDto,
  CreateBranchDto,
  WarehouseListDto,
} from './organization.dto';
import { OrganizationRepository } from './organization.repository';

@Injectable()
export class OrganizationService {
  constructor(private readonly organizations: OrganizationRepository) {}

  listBranches(): BranchListDto {
    const items = this.organizations.listBranches();
    return { items, total: items.length };
  }

  listWarehouses(): WarehouseListDto {
    const items = this.organizations.listWarehouses();
    return { items, total: items.length };
  }

  searchActiveBranches(query: ActiveSearchQueryDto): ActiveLookupResponseDto {
    return buildActiveLookupResponse(
      this.organizations
        .listBranches()
        .filter((branch) => branch.status === 'ACTIVE')
        .map((branch) => ({ id: branch.id, code: branch.code, label: branch.name })),
      query,
    );
  }

  searchActiveWarehouses(query: ActiveWarehouseSearchQueryDto): ActiveLookupResponseDto {
    return buildActiveLookupResponse(
      this.organizations
        .listWarehouses()
        .filter(
          (warehouse) =>
            warehouse.status === 'ACTIVE' &&
            (!query.branchId || warehouse.branchId === query.branchId),
        )
        .map((warehouse) => ({
          id: warehouse.id,
          code: warehouse.code,
          label: warehouse.name,
        })),
      query,
    );
  }

  createBranch(input: CreateBranchDto): BranchWithWarehouseDto {
    if (this.organizations.hasBranchCode(input.code)) {
      throw new ConflictException('Branch code already exists');
    }
    if (this.organizations.hasWarehouseCode(input.warehouse.code)) {
      throw new ConflictException('Warehouse code already exists');
    }

    const branchId = randomUUID();
    return this.organizations.saveBranchWithWarehouse(
      {
        id: branchId,
        code: input.code,
        name: input.name,
        status: 'ACTIVE',
        phone: input.phone,
        email: input.email,
        address: { ...input.address },
        timezone: 'Asia/Ho_Chi_Minh',
        version: 0,
      },
      {
        id: randomUUID(),
        branchId,
        code: input.warehouse.code,
        name: input.warehouse.name,
        status: 'ACTIVE',
        isPrimary: true,
        version: 0,
      },
    );
  }

  hasActiveBranch(id: string): boolean {
    return this.organizations.hasActiveBranch(id);
  }

  hasActiveWarehouse(id: string): boolean {
    return this.organizations.hasActiveWarehouse(id);
  }
}
