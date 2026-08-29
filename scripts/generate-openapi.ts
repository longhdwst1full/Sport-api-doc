import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildOpenApiDocument, createApplication } from '../src/platform/app.factory';

async function generate(): Promise<void> {
  process.env.AUTH_BYPASS = 'true';
  const app = await createApplication({ logger: false, swagger: false });
  const document = buildOpenApiDocument(app);
  const directory = resolve(process.cwd(), 'openapi');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
}

void generate();
