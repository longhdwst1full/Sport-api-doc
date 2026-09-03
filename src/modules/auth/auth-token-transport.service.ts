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

@Injectable()
export class AuthTokenTransportService {
  constructor(private readonly config: ConfigService) {}

  deliver(pair: TokenPairDto, response: Response, audience: AuthAudience): TokenPairDto {
    if (!this.usesCookie()) return pair;
    if (!pair.refreshToken) throw new Error('Auth service did not issue a refresh token');
    response.cookie(REFRESH_COOKIE_NAMES[audience], pair.refreshToken, this.cookieOptions(audience));
    return {
      accessToken: pair.accessToken,
      tokenType: pair.tokenType,
      expiresIn: pair.expiresIn,
      mustChangePassword: pair.mustChangePassword,
    };
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
    response.clearCookie(REFRESH_COOKIE_NAMES[audience], this.cookieOptions(audience));
  }

  private usesCookie(): boolean {
    return this.config.get<string>('app.authTokenTransport') === AUTH_TOKEN_TRANSPORT.COOKIE;
  }

  private cookieOptions(audience: AuthAudience) {
    const production = this.config.get<string>('app.environment') === 'production';
    const maxAge = (this.config.get<number>('app.jwt.refreshTtlSeconds') ?? 2_592_000) * 1_000;
    return {
      httpOnly: true,
      secure: production,
      sameSite: 'lax' as const,
      path: audience === 'admin' ? '/api/v1/admin/auth' : '/api/v1/auth',
      maxAge,
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
