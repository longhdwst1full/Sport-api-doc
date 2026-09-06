import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorDetail {
  field?: string;
  code: string;
  message: string;
}

interface StructuredExceptionBody {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

const ERROR_CODES: Readonly<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE_VIOLATION',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = this.asStructuredBody(raw);
    const details = this.extractDetails(body?.details ?? body?.message);
    const code =
      typeof body?.code === 'string' && body.code.trim()
        ? body.code
        : (ERROR_CODES[status] ?? `HTTP_${status}`);
    const message = this.extractMessage(raw, status, details);
    const responseRequestId = response.getHeader('x-request-id');
    const requestId =
      request.header('x-request-id') ??
      (typeof responseRequestId === 'string' ? responseRequestId : undefined);

    if (!(exception instanceof HttpException) || status >= 500) {
      const error = exception instanceof Error ? exception : undefined;
      this.logger.error({
        message: 'Unhandled request exception',
        requestId,
        method: request.method,
        path: request.originalUrl,
        exceptionName: error?.name ?? 'UnknownException',
        exceptionMessage: error?.message ?? 'Non-error value thrown',
        stack: error?.stack,
      });
    }

    response.status(status).json({
      statusCode: status,
      code,
      message,
      ...(details.length ? { details } : {}),
      path: request.originalUrl,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  private asStructuredBody(raw: unknown): StructuredExceptionBody | undefined {
    return raw && typeof raw === 'object' ? raw : undefined;
  }

  private extractMessage(raw: unknown, status: number, details: ErrorDetail[]): string {
    if (typeof raw === 'string') return raw;
    const body = this.asStructuredBody(raw);
    if (typeof body?.message === 'string') return body.message;
    if (details.length) return status === 400 ? 'Request validation failed' : details[0].message;
    return status === 500 ? 'Internal server error' : 'Request failed';
  }

  private extractDetails(raw: unknown): ErrorDetail[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (typeof item === 'string') {
        return [{ code: 'INVALID_VALUE', message: item }];
      }
      if (!item || typeof item !== 'object' || !('message' in item)) return [];
      const detail = item as Partial<ErrorDetail>;
      if (typeof detail.message !== 'string') return [];
      return [
        {
          ...(typeof detail.field === 'string' ? { field: detail.field } : {}),
          code: typeof detail.code === 'string' ? detail.code : 'INVALID_VALUE',
          message: detail.message,
        },
      ];
    });
  }
}
