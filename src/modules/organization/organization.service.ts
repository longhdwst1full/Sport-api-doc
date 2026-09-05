import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MutationContext } from '../../common/request/request-context';
import {
  ActiveLookupResponseDto,
  ActiveSearchQueryDto,
  ActiveWarehouseSearchQueryDto,
  buildActiveLookupResponse,
} from '../../common/pagination/active-search.dto';
import {
  BranchListDto,
  BranchWithWarehouseDto,
  ChangeBranchStatusDto,
  CreateBranchDto,
  UpdateBranchWithWarehouseDto,
  WarehouseListDto,
} from './organization.dto';
import { OrganizationRepository } from './organization.repository';

@Injectable()
export class OrganizationService {
  constructor(private readonly organizations: OrganizationRepository) {}

  async listBranches(): Promise<BranchListDto> {
    const items = await this.organizations.listBranches();
    return { items, total: items.length };
  }

  async listWarehouses(): Promise<WarehouseListDto> {
    const items = await this.organizations.listWarehouses();
    return { items, total: items.length };
  }

  async searchActiveBranches(query: ActiveSearchQueryDto): Promise<ActiveLookupResponseDto> {
    return buildActiveLookupResponse(
      (await this.organizations.listBranches())
        .filter((branch) => branch.status === 'ACTIVE')
        .map((branch) => ({ id: branch.id, code: branch.code, label: branch.name })),
      query,
    );
  }

  async searchActiveWarehouses(
    query: ActiveWarehouseSearchQueryDto,
  ): Promise<ActiveLookupResponseDto> {
    return buildActiveLookupResponse(
      (await this.organizations.listWarehouses())
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

  async createBranch(
    input: CreateBranchDto,
    context: MutationContext,
  ): Promise<BranchWithWarehouseDto> {
    if (await this.organizations.hasBranchCode(input.code)) {
      throw new ConflictException('Branch code already exists');
    }
    if (await this.organizations.hasWarehouseCode(input.warehouse.code)) {
      throw new ConflictException('Warehouse code already exists');
    }

    try {
      return await this.organizations.saveBranchWithWarehouse(
      {
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
        code: input.warehouse.code,
        name: input.warehouse.name,
        status: 'ACTIVE',
        isPrimary: true,
        version: 0,
        },
        context,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Branch or warehouse code already exists');
      }
      throw error;
    }
  }

  async updateBranch(
    id: string,
    input: UpdateBranchWithWarehouseDto,
    context: MutationContext,
  ): Promise<BranchWithWarehouseDto> {
    await this.assertBranchAndWarehouseExist(id);
    const result = await this.organizations.updateBranchWithWarehouse(
      id,
      {
        name: input.name,
        phone: input.phone,
        email: input.email,
        address: { ...input.address },
        warehouseName: input.warehouse.name,
      },
      input.expectedVersion,
      input.warehouseExpectedVersion,
      context,
    );
    if (!result) throw new ConflictException('Branch or warehouse version conflict');
    return result;
  }

  async changeBranchStatus(
    id: string,
    status: BranchWithWarehouseDto['branch']['status'],
    input: ChangeBranchStatusDto,
    context: MutationContext,
  ): Promise<BranchWithWarehouseDto> {
    await this.assertBranchAndWarehouseExist(id);
    const result = await this.organizations.changeBranchStatus(
      id,
      status,
      input.expectedVersion,
      input.warehouseExpectedVersion,
      context,
    );
    if (!result) throw new ConflictException('Branch or warehouse version conflict');
    return result;
  }

  hasActiveBranch(id: string): Promise<boolean> {
    return this.organizations.hasActiveBranch(id);
  }

  hasActiveWarehouse(id: string): Promise<boolean> {
    return this.organizations.hasActiveWarehouse(id);
  }

  private async assertBranchAndWarehouseExist(id: string): Promise<void> {
    const [branches, warehouses] = await Promise.all([
      this.organizations.listBranches(),
      this.organizations.listWarehouses(),
    ]);
    if (!branches.some((branch) => branch.id === id)) {
      throw new NotFoundException('Branch not found');
    }
    if (!warehouses.some((warehouse) => warehouse.branchId === id)) {
      throw new NotFoundException('Branch warehouse not found');
    }
  }
}
