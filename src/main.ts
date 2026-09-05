import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './platform/app.factory';

async function bootstrap(): Promise<void> {
  // Keep NestFactory.create in the conventional entrypoint. Vercel's NestJS
  // detector statically inspects this file before compiling the application.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  await configureApplication(app, { logger: true, swagger: true });
  const port = app.get(ConfigService).get<number>('app.port') ?? 4000;
  await app.listen(port);
}

void bootstrap();
