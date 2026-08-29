import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    if (this.config.get<boolean>('app.authBypass')) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const granted = new Set(
      (request.header('x-permissions') ?? '')
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    );
    return required.every((permission) => granted.has(permission));
  }
}
