import { ConfigService } from '@nestjs/config';
import { createApplication } from './platform/app.factory';

async function bootstrap(): Promise<void> {
  const app = await createApplication({ logger: true, swagger: true });
  const port = app.get(ConfigService).get<number>('app.port') ?? 4000;
  await app.listen(port);
}

void bootstrap();
