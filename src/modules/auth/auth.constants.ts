export const AUTH_SECURITY = {
  MAX_FAILED_LOGIN_ATTEMPTS: 5,
  AUTO_LOCK_REASON: 'MAX_FAILED_LOGIN_ATTEMPTS',
} as const;

export const AUTH_ERROR = {
  INVALID_CREDENTIALS: {
    code: 'UNAUTHORIZED',
    message: 'Email/phone or password is incorrect',
  },
  ACCOUNT_LOCKED: {
    code: 'ACCOUNT_LOCKED',
    message: 'Tài khoản đã bị khóa do nhập sai mật khẩu 5 lần. Vui lòng liên hệ Admin để mở khóa.',
  },
  /**
   * CONTRACT: Admin/Storefront chỉ đăng xuất khi refresh trả 401 (ba mã dưới); 409 CONFLICT là lỗi
   * tạm thời và được thử lại. Trước đây mọi nhánh chung mã UNAUTHORIZED nên FE không phân biệt được.
   */
  REFRESH_INVALID: {
    code: 'AUTH_REFRESH_INVALID',
    message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  },
  REFRESH_REUSED: {
    code: 'AUTH_REFRESH_REUSED',
    message: 'Phiên đăng nhập đã được làm mới ở nơi khác. Vui lòng đăng nhập lại.',
  },
  REFRESH_MISSING: {
    code: 'AUTH_REFRESH_MISSING',
    message: 'Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại.',
  },
  REFRESH_CONFLICT: {
    code: 'AUTH_REFRESH_CONFLICT',
    message: 'Phiên đăng nhập đang được làm mới. Vui lòng thử lại.',
  },
} as const;

export const AUTH_SESSION_REVOKE_REASON = {
  ROTATED: 'ROTATED',
  LOGOUT: 'LOGOUT',
} as const;

/** Số lần chạy lại transaction refresh khi PostgreSQL báo xung đột serialization trước khi trả 409. */
export const AUTH_REFRESH_MAX_ATTEMPTS = 2;

export const AUTH_AUDIT_ACTION = {
  ACCOUNT_AUTO_LOCK: 'auth.account.auto_lock',
  PASSWORD_CHANGE: 'auth.password.change',
  PASSWORD_RESET_REQUESTED: 'auth.password.reset_requested',
  PASSWORD_RESET_COMPLETED: 'auth.password.reset_completed',
} as const;

export const AUTH_TOKEN_TRANSPORT = {
  BODY: 'BODY',
  COOKIE: 'COOKIE',
} as const;

export type AuthTokenTransport =
  (typeof AUTH_TOKEN_TRANSPORT)[keyof typeof AUTH_TOKEN_TRANSPORT];
