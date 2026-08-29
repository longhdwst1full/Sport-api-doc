import { Branch, BranchWithWarehouse, Warehouse } from './organization.types';

export abstract class OrganizationRepository {
  abstract listBranches(): Branch[];
  abstract listWarehouses(): Warehouse[];
  abstract hasBranchCode(code: string): boolean;
  abstract hasWarehouseCode(code: string): boolean;
  abstract hasActiveBranch(id: string): boolean;
  abstract hasActiveWarehouse(id: string): boolean;
  abstract saveBranchWithWarehouse(branch: Branch, warehouse: Warehouse): BranchWithWarehouse;
}
