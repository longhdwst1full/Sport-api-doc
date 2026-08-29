const { mkdir, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const {
  buildOpenApiDocument,
  createApplication,
} = require('../dist/platform/app.factory');

async function generate() {
  process.env.AUTH_BYPASS = 'true';
  const app = await createApplication({ logger: false, swagger: false });
  const document = buildOpenApiDocument(app);
  const directory = resolve(process.cwd(), 'openapi');
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
  );
  await app.close();
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
