import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AUTH_TOKEN_TRANSPORT } from './auth.constants';
import type { RefreshTokenDto, TokenPairDto } from './auth.dto';

type AuthAudience = 'admin' | 'customer';

const REFRESH_COOKIE_NAMES: Record<AuthAudience, string> = {
  admin: 'dctd_admin_refresh',
  customer: 'dctd_customer_refresh',
};

const REMEMBER_COOKIE_NAMES: Record<AuthAudience, string> = {
  admin: 'dctd_admin_refresh_remember',
  customer: 'dctd_customer_refresh_remember',
};

@Injectable()
export class AuthTokenTransportService {
  constructor(private readonly config: ConfigService) {}

  deliver(
    pair: TokenPairDto,
    response: Response,
    audience: AuthAudience,
    rememberMe = false,
  ): TokenPairDto {
    if (!this.usesCookie()) return pair;
    if (!pair.refreshToken) throw new Error('Auth service did not issue a refresh token');
    response.cookie(
      REFRESH_COOKIE_NAMES[audience],
      pair.refreshToken,
      this.refreshCookieOptions(audience, rememberMe),
    );
    if (rememberMe) {
      // CONTRACT: Request không cho đọc thuộc tính Max-Age của cookie cũ. Cookie HttpOnly
      // này giữ lựa chọn ban đầu để refresh rotation không đổi cookie dài hạn thành session.
      response.cookie(
        REMEMBER_COOKIE_NAMES[audience],
        '1',
        this.refreshCookieOptions(audience, true),
      );
    } else {
      response.clearCookie(REMEMBER_COOKIE_NAMES[audience], this.baseCookieOptions(audience));
    }
    return {
      accessToken: pair.accessToken,
      tokenType: pair.tokenType,
      expiresIn: pair.expiresIn,
      mustChangePassword: pair.mustChangePassword,
    };
  }

  isRemembered(request: Request, audience: AuthAudience): boolean {
    if (!this.usesCookie()) return false;
    return this.parseCookies(request.headers.cookie)[REMEMBER_COOKIE_NAMES[audience]] === '1';
  }

  readRefreshToken(
    request: Request,
    input: RefreshTokenDto,
    audience: AuthAudience,
  ): string {
    const fromBody = input.refreshToken?.trim();
    if (!this.usesCookie()) {
      if (!fromBody) throw new BadRequestException('refreshToken is required');
      return fromBody;
    }
    const fromCookie = this.parseCookies(request.headers.cookie)[REFRESH_COOKIE_NAMES[audience]];
    if (!fromCookie) throw new BadRequestException('Refresh cookie is required');
    return fromCookie;
  }

  clear(response: Response, audience: AuthAudience): void {
    if (!this.usesCookie()) return;
    const options = this.baseCookieOptions(audience);
    response.clearCookie(REFRESH_COOKIE_NAMES[audience], options);
    response.clearCookie(REMEMBER_COOKIE_NAMES[audience], options);
  }

  private usesCookie(): boolean {
    return this.config.get<string>('app.authTokenTransport') === AUTH_TOKEN_TRANSPORT.COOKIE;
  }

  private baseCookieOptions(audience: AuthAudience) {
    const production = this.config.get<string>('app.environment') === 'production';
    return {
      httpOnly: true,
      secure: production,
      // Admin/Storefront và API deploy ở các hostname Vercel khác nhau. Production
      // cần None + Secure để browser gửi refresh cookie cho request cross-site.
      sameSite: production ? ('none' as const) : ('lax' as const),
      path: audience === 'admin' ? '/api/v1/admin/auth' : '/api/v1/auth',
    };
  }

  private refreshCookieOptions(audience: AuthAudience, rememberMe: boolean) {
    const options = this.baseCookieOptions(audience);
    if (!rememberMe) return options;
    return {
      ...options,
      maxAge: (this.config.get<number>('app.jwt.refreshTtlSeconds') ?? 2_592_000) * 1_000,
    };
  }

  private parseCookies(header: string | undefined): Record<string, string> {
    if (!header) return {};
    return Object.fromEntries(
      header.split(';').flatMap((entry) => {
        const separator = entry.indexOf('=');
        if (separator < 1) return [];
        const key = entry.slice(0, separator).trim();
        const value = entry.slice(separator + 1).trim();
        try {
          return [[key, decodeURIComponent(value)]];
        } catch {
          return [];
        }
      }),
    );
  }
}
