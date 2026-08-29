import compression from 'compression';
import helmet from 'helmet';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { createValidationException } from '../common/exceptions/validation-exception.factory';

interface CreateApplicationOptions {
  logger: boolean;
  swagger: boolean;
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('DCTD-UTC Commerce API')
    .setDescription('Contract for storefront and admin applications')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addServer('http://localhost:4000', 'Local')
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controller, method) => method,
  });
}

export async function createApplication(
  options: CreateApplicationOptions,
): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: options.logger,
    logger: options.logger ? undefined : false,
  });

  if (options.logger) app.useLogger(app.get(PinoLogger));
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? [];
  app.enableCors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: createValidationException,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  if (options.swagger) {
    const document = buildOpenApiDocument(app);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'openapi.json',
      customSiteTitle: 'DCTD-UTC API',
    });
  }

  await app.init();
  if (options.logger) app.get(PinoLogger).log('Application initialized', 'Bootstrap');
  return app;
}
