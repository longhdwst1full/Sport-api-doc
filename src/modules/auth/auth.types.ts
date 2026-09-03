import { ScopeType } from '../iam/iam.types';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  pv: string;
  typ: 'access';
}

export interface AuthScope {
  type: ScopeType;
  branchId?: string;
}

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  displayName: string;
  permissionVersion: string;
  permissions: string[];
  scopes: AuthScope[];
  mustChangePassword: boolean;
}
