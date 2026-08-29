import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthPrincipal } from '../../modules/auth/auth.types';

export interface AuthenticatedRequest extends Request {
  auth?: AuthPrincipal;
}

export interface MutationContext {
  requestId: string;
  actorUserId: string;
}

export function getAuthPrincipal(request: AuthenticatedRequest): AuthPrincipal {
  if (!request.auth) throw new UnauthorizedException('Verified identity is required');
  return request.auth;
}

export function getMutationContext(request: AuthenticatedRequest): MutationContext {
  if (!request.auth) throw new UnauthorizedException('Verified identity is required');
  const requestId =
    typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : (request.header('x-request-id') ?? `request-${request.auth.sessionId}`);
  return { requestId, actorUserId: request.auth.userId };
}
