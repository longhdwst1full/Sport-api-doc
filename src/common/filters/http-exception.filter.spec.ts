import { ArgumentsHost, BadRequestException, ConflictException } from '@nestjs/common';
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
        message: 'Dữ liệu gửi lên không hợp lệ.',
        method: 'GET',
        path: request.originalUrl,
        requestId: 'request-123',
        details: [
          {
            field: 'limit',
            code: 'MAX',
            message: 'Trường "limit": Giá trị vượt quá giới hạn tối đa.',
          },
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
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('database password leaked');
  });

  it('replaces an unknown English business message with a safe Vietnamese fallback', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/v1/test', method: 'POST', header: jest.fn() }),
        getResponse: () => ({ status, getHeader: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new BadRequestException('Unknown English provider validation message'),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR', message: 'Yêu cầu không hợp lệ.' }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('Unknown English provider validation message');
  });

  it('keeps a Vietnamese business message unchanged', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ originalUrl: '/api/v1/test', method: 'PATCH', header: jest.fn() }),
        getResponse: () => ({ status, getHeader: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(
      new ConflictException('Sản phẩm đã được cập nhật bởi người khác.'),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CONFLICT',
        message: 'Sản phẩm đã được cập nhật bởi người khác.',
      }),
    );
  });
});
