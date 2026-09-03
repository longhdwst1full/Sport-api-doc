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
    const response = { cookie } as unknown as Response;
    expect(service.deliver(pair, response, 'admin')).toEqual({
      accessToken: 'access', tokenType: 'Bearer', expiresIn: 900, mustChangePassword: true,
    });
    expect(cookie).toHaveBeenCalledWith(
      'dctd_admin_refresh',
      pair.refreshToken,
      expect.objectContaining({ httpOnly: true, secure: true, path: '/api/v1/admin/auth' }),
    );
  });

  it('reads a URL-encoded refresh cookie without accepting a missing cookie', () => {
    const service = new AuthTokenTransportService(new ConfigService({ app: { authTokenTransport: 'COOKIE' } }));
    const request = { headers: { cookie: 'other=x; dctd_customer_refresh=abc%2B123' } } as Request;
    expect(service.readRefreshToken(request, {}, 'customer')).toBe('abc+123');
  });
});
