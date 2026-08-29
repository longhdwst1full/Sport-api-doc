import { Branch, BranchWithWarehouse, Warehouse } from './organization.types';
import { MutationContext } from '../../common/request/request-context';

export abstract class OrganizationRepository {
  abstract listBranches(): Promise<Branch[]>;
  abstract listWarehouses(): Promise<Warehouse[]>;
  abstract hasBranchCode(code: string): Promise<boolean>;
  abstract hasWarehouseCode(code: string): Promise<boolean>;
  abstract hasActiveBranch(id: string): Promise<boolean>;
  abstract hasActiveWarehouse(id: string): Promise<boolean>;
  abstract saveBranchWithWarehouse(
    branch: Branch,
    warehouse: Warehouse,
    context: MutationContext,
  ): Promise<BranchWithWarehouse>;
}
