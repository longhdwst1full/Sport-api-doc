import { Permission } from './iam.types';

export const PERMISSION_CATALOG: readonly Permission[] = [
  { code: 'org.branch.view', module: 'Organization', action: 'view', sensitive: false },
  { code: 'org.branch.manage', module: 'Organization', action: 'manage', sensitive: true },
  { code: 'org.warehouse.view', module: 'Organization', action: 'view', sensitive: false },
  { code: 'org.warehouse.manage', module: 'Organization', action: 'manage', sensitive: true },
  { code: 'iam.user.view', module: 'IAM', action: 'view', sensitive: true },
  { code: 'iam.user.manage', module: 'IAM', action: 'manage', sensitive: true },
  { code: 'iam.role.view', module: 'IAM', action: 'view', sensitive: false },
  { code: 'iam.role.manage', module: 'IAM', action: 'manage', sensitive: true },
  { code: 'iam.assignment.manage', module: 'IAM', action: 'manage', sensitive: true },
  { code: 'iam.audit.view', module: 'IAM', action: 'view', sensitive: true },
] as const;
