import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = typeof raw === 'string' ? raw : this.extractMessage(raw);

    response.status(status).json({
      statusCode: status,
      code: status === 400 ? 'VALIDATION_ERROR' : `HTTP_${status}`,
      message,
      details: typeof raw === 'object' ? raw : undefined,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: request.header('x-request-id'),
    });
  }

  private extractMessage(raw: unknown): string {
    if (raw && typeof raw === 'object' && 'message' in raw) {
      const message = raw.message;
      return Array.isArray(message) ? message.join('; ') : String(message);
    }
    return 'Unexpected error';
  }
}
