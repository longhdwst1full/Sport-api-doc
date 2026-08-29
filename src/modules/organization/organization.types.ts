export type OrganizationStatus = 'ACTIVE' | 'INACTIVE';

export interface Address {
  addressLine: string;
  district: string;
  province: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  status: OrganizationStatus;
  phone?: string;
  email?: string;
  address: Address;
  timezone: string;
  version: number;
}

export interface Warehouse {
  id: string;
  branchId: string;
  code: string;
  name: string;
  status: OrganizationStatus;
  isPrimary: boolean;
  version: number;
}

export interface BranchWithWarehouse {
  branch: Branch;
  warehouse: Warehouse;
}
