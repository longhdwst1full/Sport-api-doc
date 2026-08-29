import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  it('returns the canonical validation error contract', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const request = {
      originalUrl: '/api/v1/admin/iam/roles/active?limit=100',
      method: 'GET',
      header: jest.fn(() => 'request-123'),
    };
    const response = { status, getHeader: jest.fn() };
    const host = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [{ field: 'limit', code: 'MAX', message: 'limit must not be greater than 50' }],
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        method: 'GET',
        path: request.originalUrl,
        requestId: 'request-123',
        details: [
          { field: 'limit', code: 'MAX', message: 'limit must not be greater than 50' },
        ],
      }),
    );
  });

  it('does not expose an unknown internal exception message', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/v1/test', method: 'GET', header: jest.fn() }),
        getResponse: () => ({ status, getHeader: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(new Error('database password leaked'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_ERROR', message: 'Internal server error' }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('database password leaked');
  });
});
