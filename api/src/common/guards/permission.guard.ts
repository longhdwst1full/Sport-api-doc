import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTHENTICATION_REQUIRED_KEY } from '../decorators/require-authentication.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import type { AuthPrincipal } from '../../modules/auth/auth.types';

interface AuthenticatedRequest extends Request {
  auth?: AuthPrincipal;
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
    if (!required?.length && !authenticationRequired) return true;
    if (this.config.get<boolean>('app.authBypass')) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
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
