import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthTokenTransportService } from './auth-token-transport.service';

describe('AuthTokenTransportService', () => {
  const pair = {
    accessToken: 'access',
    refreshToken: 'refresh-token-value-at-least-32-characters',
    tokenType: 'Bearer' as const,
    expiresIn: 900,
    mustChangePassword: true,
  };

  it('keeps the development BODY transport backward compatible', () => {
    const service = new AuthTokenTransportService(new ConfigService({ app: { authTokenTransport: 'BODY' } }));
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;
    expect(service.deliver(pair, response, 'admin')).toEqual(pair);
    expect(cookie).not.toHaveBeenCalled();
  });

  it('moves only the refresh token to an HttpOnly cookie in COOKIE transport', () => {
    const service = new AuthTokenTransportService(new ConfigService({
      app: { authTokenTransport: 'COOKIE', environment: 'production', jwt: { refreshTtlSeconds: 3600 } },
    }));
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    const response = { cookie, clearCookie } as unknown as Response;
    expect(service.deliver(pair, response, 'admin', true)).toEqual({
      accessToken: 'access', tokenType: 'Bearer', expiresIn: 900, mustChangePassword: true,
    });
    expect(cookie).toHaveBeenCalledWith(
      'dctd_admin_refresh',
      pair.refreshToken,
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'none', path: '/api/v1/admin/auth', maxAge: 3_600_000 }),
    );
    expect(cookie).toHaveBeenCalledWith(
      'dctd_admin_refresh_remember',
      '1',
      expect.objectContaining({ httpOnly: true, maxAge: 3_600_000 }),
    );
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('keeps development refresh cookie same-site compatible on http', () => {
    const service = new AuthTokenTransportService(new ConfigService({
      app: { authTokenTransport: 'COOKIE', environment: 'development' },
    }));
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    service.deliver(pair, { cookie, clearCookie } as unknown as Response, 'customer');
    expect(cookie).toHaveBeenCalledWith(
      'dctd_customer_refresh',
      pair.refreshToken,
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/api/v1/auth',
      },
    );
    expect(clearCookie).toHaveBeenCalledWith(
      'dctd_customer_refresh_remember',
      expect.objectContaining({ path: '/api/v1/auth' }),
    );
  });

  it('reads a URL-encoded refresh cookie without accepting a missing cookie', () => {
    const service = new AuthTokenTransportService(new ConfigService({ app: { authTokenTransport: 'COOKIE' } }));
    const request = { headers: { cookie: 'other=x; dctd_customer_refresh=abc%2B123' } } as Request;
    expect(service.readRefreshToken(request, {}, 'customer')).toBe('abc+123');
  });

  it('preserves the remembered choice during refresh rotation', () => {
    const service = new AuthTokenTransportService(new ConfigService({
      app: { authTokenTransport: 'COOKIE', environment: 'production' },
    }));
    const remembered = {
      headers: { cookie: 'dctd_admin_refresh=token; dctd_admin_refresh_remember=1' },
    } as Request;
    const sessionOnly = {
      headers: { cookie: 'dctd_admin_refresh=token' },
    } as Request;

    expect(service.isRemembered(remembered, 'admin')).toBe(true);
    expect(service.isRemembered(sessionOnly, 'admin')).toBe(false);
  });

  it('clears both the refresh and remember cookies on logout', () => {
    const service = new AuthTokenTransportService(new ConfigService({
      app: { authTokenTransport: 'COOKIE', environment: 'production' },
    }));
    const clearCookie = jest.fn();
    service.clear({ clearCookie } as unknown as Response, 'admin');

    expect(clearCookie).toHaveBeenNthCalledWith(
      1,
      'dctd_admin_refresh',
      {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/v1/admin/auth',
      },
    );
    expect(clearCookie).toHaveBeenNthCalledWith(
      2,
      'dctd_admin_refresh_remember',
      expect.objectContaining({ path: '/api/v1/admin/auth' }),
    );
  });
});
