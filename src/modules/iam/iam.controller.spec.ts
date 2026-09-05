import type { AuthenticatedRequest } from '../../common/request/request-context';
import { IamController } from './iam.controller';
import type { IamService } from './iam.service';

describe('IamController logical DELETE', () => {
  it('maps staff DELETE to the existing lock and session-revocation lifecycle', async () => {
    const lockStaffUser = jest.fn().mockResolvedValue({ id: '17', status: 'LOCKED' });
    const controller = new IamController({ lockStaffUser } as unknown as IamService);
    const request = {
      id: 'delete-staff-request',
      auth: {
        userId: '1',
        sessionId: 'session-id',
        displayName: 'Root Admin',
        permissionVersion: '1',
        permissions: ['iam.user.manage'],
        scopes: [{ type: 'GLOBAL' }],
        mustChangePassword: false,
      },
    } as unknown as AuthenticatedRequest;
    const input = { reason: 'Nhân viên đã nghỉ việc' };

    await controller.deleteStaffUser('17', input, request);

    expect(lockStaffUser).toHaveBeenCalledWith(
      '17',
      input,
      { requestId: 'delete-staff-request', actorUserId: '1' },
      request.auth,
    );
  });
});
