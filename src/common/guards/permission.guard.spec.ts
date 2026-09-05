import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATION_REQUIRED_KEY } from '../decorators/require-authentication.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import type { AuthPrincipal } from '../../modules/auth/auth.types';
import { ScopeType } from '../../modules/iam/iam.types';
import { PermissionGuard } from './permission.guard';

interface TestRequest {
  auth?: AuthPrincipal;
  header: jest.Mock<string | undefined, [string]>;
}

function createGuard(
  environment: string,
  authBypass: boolean,
  request: TestRequest,
  required = ['catalog.product.manage'],
  authenticationRequired = false,
) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === PERMISSIONS_KEY) return required;
      if (key === AUTHENTICATION_REQUIRED_KEY) return authenticationRequired;
      return undefined;
    }),
  } as unknown as Reflector;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'app.environment') return environment;
      if (key === 'app.authBypass') return authBypass;
      return undefined;
    }),
  } as unknown as ConfigService;
  const auth = { authorizeAccessToken: jest.fn() } as unknown as AuthService;
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { guard: new PermissionGuard(reflector, config, auth), context, auth };
}

describe('PermissionGuard development bypass', () => {
  it('attaches a global development principal and skips permission checks in development', async () => {
    const request: TestRequest = { header: jest.fn<string | undefined, [string]>() };
    const { guard, context } = createGuard('development', true, request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toMatchObject({
      userId: '00000000-0000-7000-8000-000000000010',
      scopes: [{ type: ScopeType.GLOBAL }],
    });
    expect(request.auth?.permissions).toEqual(
      expect.arrayContaining([
        'catalog.product.manage',
        'iam.user.view',
        'iam.role.view',
        'iam.role.manage',
        'iam.assignment.manage',
      ]),
    );
  });

  it('returns the complete OWNER permission set for authentication-only endpoints such as me', async () => {
    const request: TestRequest = { header: jest.fn<string | undefined, [string]>() };
    const { guard, context } = createGuard('development', true, request, [], true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth?.permissions).toContain('iam.user.view');
    expect(request.auth?.permissions).toContain('iam.role.view');
    expect(request.auth?.permissions).toContain('iam.assignment.manage');
  });

  it('never honors the bypass outside development', async () => {
    const request: TestRequest = {
      header: jest.fn<string | undefined, [string]>().mockReturnValue(undefined),
    };
    const { guard, context } = createGuard('production', true, request);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.auth).toBeUndefined();
  });

  it('allows authentication-only routes but blocks permission routes until password changes', async () => {
    const request: TestRequest = {
      header: jest.fn<string | undefined, [string]>().mockReturnValue('Bearer access'),
    };
    const { guard, context, auth } = createGuard('production', false, request);
    jest.spyOn(auth, 'authorizeAccessToken').mockResolvedValue({
      userId: 'user',
      sessionId: 'session',
      displayName: 'Staff',
      permissionVersion: '1',
      permissions: ['catalog.product.manage'],
      scopes: [{ type: ScopeType.BRANCH, branchId: 'branch' }],
      mustChangePassword: true,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
