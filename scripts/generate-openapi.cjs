const { buildOpenApiDocument, createApplication } = require('../dist/platform/app.factory');
const { writeOpenApiArtifacts } = require('../dist/platform/openapi/openapi-artifact.writer');

async function generate() {
  process.env.AUTH_BYPASS = 'true';
  const app = await createApplication({ logger: false, swagger: false });
  try {
    await writeOpenApiArtifacts(buildOpenApiDocument(app), process.cwd());
  } finally {
    await app.close();
  }
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
