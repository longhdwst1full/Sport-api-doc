import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTHENTICATION_REQUIRED_KEY } from '../decorators/require-authentication.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import type { AuthPrincipal } from '../../modules/auth/auth.types';
import { ScopeType } from '../../modules/iam/iam.types';

interface AuthenticatedRequest extends Request {
  auth?: AuthPrincipal;
}

const DEVELOPMENT_OWNER_ID = '00000000-0000-7000-8000-000000000010';

function createDevelopmentPrincipal(requiredPermissions: string[]): AuthPrincipal {
  return {
    userId: DEVELOPMENT_OWNER_ID,
    sessionId: 'development-auth-bypass',
    displayName: 'Development Owner',
    permissionVersion: 'dev',
    permissions: requiredPermissions,
    scopes: [{ type: ScopeType.GLOBAL }],
  };
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const authenticationRequired = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATION_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!required?.length && !authenticationRequired) return true;
    const developmentBypass =
      this.config.get<string>('app.environment') === 'development' &&
      this.config.get<boolean>('app.authBypass') === true;
    if (developmentBypass) {
      request.auth = createDevelopmentPrincipal(required ?? []);
      return true;
    }

    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer access token is required');
    }
    const principal = await this.auth.authorizeAccessToken(authorization.slice(7).trim());
    request.auth = principal;
    const granted = new Set(principal.permissions);
    return required.every((permission) => granted.has(permission));
  }
}
