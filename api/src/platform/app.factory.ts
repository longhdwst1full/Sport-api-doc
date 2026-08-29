import compression from 'compression';
import helmet from 'helmet';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '../app.module';
import { HttpExceptionFilter } from './http/http-exception.filter';

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
    logger: options.logger ? ['log', 'error', 'warn', 'debug'] : false,
  });

  app.setGlobalPrefix('api/v1');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
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
  Logger.log('Application initialized', 'Bootstrap');
  return app;
}
