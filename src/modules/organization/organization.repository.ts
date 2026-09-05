import {
  Branch,
  BranchWithWarehouse,
  BranchWithWarehouseUpdate,
  NewBranch,
  NewWarehouse,
  OrganizationStatus,
  Warehouse,
} from './organization.types';
import { MutationContext } from '../../common/request/request-context';

export abstract class OrganizationRepository {
  abstract listBranches(): Promise<Branch[]>;
  abstract listWarehouses(): Promise<Warehouse[]>;
  abstract hasBranchCode(code: string): Promise<boolean>;
  abstract hasWarehouseCode(code: string): Promise<boolean>;
  abstract hasActiveBranch(id: string): Promise<boolean>;
  abstract hasActiveWarehouse(id: string): Promise<boolean>;
  abstract saveBranchWithWarehouse(
    branch: NewBranch,
    warehouse: NewWarehouse,
    context: MutationContext,
  ): Promise<BranchWithWarehouse>;
  abstract updateBranchWithWarehouse(
    branchId: string,
    input: BranchWithWarehouseUpdate,
    expectedVersion: number,
    warehouseExpectedVersion: number,
    context: MutationContext,
  ): Promise<BranchWithWarehouse | null>;
  abstract changeBranchStatus(
    branchId: string,
    status: OrganizationStatus,
    expectedVersion: number,
    warehouseExpectedVersion: number,
    context: MutationContext,
  ): Promise<BranchWithWarehouse | null>;
}
