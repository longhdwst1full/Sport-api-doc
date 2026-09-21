import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { AuthTokenTransportService } from './auth-token-transport.service';

describe('AuthController remember-me wiring', () => {
  const pair = {
    accessToken: 'access',
    refreshToken: 'refresh-token-value-at-least-32-characters',
    tokenType: 'Bearer' as const,
    expiresIn: 900,
    mustChangePassword: false,
  };
  const request = {
    id: 'request-id',
    headers: { cookie: 'dctd_admin_refresh=old' },
    header: jest.fn(),
  } as unknown as Request;
  const response = {} as Response;

  it('passes the login preference to COOKIE transport', async () => {
    const auth = { login: jest.fn().mockResolvedValue(pair) };
    const transport = { deliver: jest.fn().mockReturnValue(pair) };
    const controller = new AuthController(
      auth as unknown as AuthService,
      transport as unknown as AuthTokenTransportService,
    );

    await controller.login(
      { identifier: 'admin@example.com', password: 'Aa@123456', rememberMe: true },
      request,
      response,
    );

    expect(transport.deliver).toHaveBeenCalledWith(pair, response, 'admin', true);
  });

  it('preserves the cookie preference while rotating a refresh token', async () => {
    const auth = { refresh: jest.fn().mockResolvedValue(pair) };
    const transport = {
      readRefreshToken: jest.fn().mockReturnValue('old-refresh-token'),
      isRemembered: jest.fn().mockReturnValue(true),
      deliver: jest.fn().mockReturnValue(pair),
    };
    const controller = new AuthController(
      auth as unknown as AuthService,
      transport as unknown as AuthTokenTransportService,
    );

    await controller.refresh({}, request, response);

    expect(transport.isRemembered).toHaveBeenCalledWith(request, 'admin');
    expect(transport.deliver).toHaveBeenCalledWith(pair, response, 'admin', true);
  });
});
