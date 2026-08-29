import { createApplication } from './platform/app.factory';

async function bootstrap(): Promise<void> {
  const app = await createApplication({ logger: true, swagger: true });
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
