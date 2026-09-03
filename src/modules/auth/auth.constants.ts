export const AUTH_SECURITY = {
  MAX_FAILED_LOGIN_ATTEMPTS: 5,
  AUTO_LOCK_REASON: 'MAX_FAILED_LOGIN_ATTEMPTS',
} as const;

export const AUTH_AUDIT_ACTION = {
  ACCOUNT_AUTO_LOCK: 'auth.account.auto_lock',
  PASSWORD_CHANGE: 'auth.password.change',
} as const;

export const AUTH_TOKEN_TRANSPORT = {
  BODY: 'BODY',
  COOKIE: 'COOKIE',
} as const;

export type AuthTokenTransport =
  (typeof AUTH_TOKEN_TRANSPORT)[keyof typeof AUTH_TOKEN_TRANSPORT];
