import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './platform/app.factory';

type NodeRequestListener = (request: IncomingMessage, response: ServerResponse) => void;

/**
 * Vercel nạp file này như một serverless function và yêu cầu một default export
 * nhận (req, res). Ở đó không có cổng nào để `listen`, nên chỉ `app.init()` rồi
 * trả về instance Express bên dưới. Máy chủ thường (Docker, `yarn start`) vẫn
 * `listen` như cũ.
 */
const isServerless = Boolean(process.env.VERCEL);

async function bootstrap(): Promise<NodeRequestListener> {
  // Keep NestFactory.create in the conventional entrypoint. Vercel's NestJS
  // detector statically inspects this file before compiling the application.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  await configureApplication(app, { logger: true, swagger: true });

  if (isServerless) {
    await app.init();
  } else {
    const port = app.get(ConfigService).get<number>('app.port') ?? 4000;
    await app.listen(port);
  }

  return app.getHttpAdapter().getInstance() as NodeRequestListener;
}

// Khởi động đúng một lần cho mỗi container và dùng lại ở các request sau.
const application = bootstrap();

// Request đầu tiên có thể tới trước khi Nest init xong, nên phải chờ promise
// thay vì export thẳng instance — nếu không sẽ 500 ngẫu nhiên lúc cold start.
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  (await application)(request, response);
}

if (!isServerless) {
  void application;
}
