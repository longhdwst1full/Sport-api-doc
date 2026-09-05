import { V1_ROLE_PERMISSIONS } from './iam.permissions';

describe('V1_ROLE_PERMISSIONS', () => {
  it('reserves staff-account and assignment management for the single OWNER', () => {
    const rootAdminPermissions = [
      'iam.user.manage',
      'iam.role.view',
      'iam.assignment.manage',
    ];

    expect(V1_ROLE_PERMISSIONS.OWNER).toEqual(
      expect.arrayContaining(rootAdminPermissions),
    );
    expect(V1_ROLE_PERMISSIONS.BRANCH_MANAGER).not.toEqual(
      expect.arrayContaining(rootAdminPermissions),
    );
    expect(V1_ROLE_PERMISSIONS.STAFF).not.toEqual(
      expect.arrayContaining(rootAdminPermissions),
    );
  });
});
