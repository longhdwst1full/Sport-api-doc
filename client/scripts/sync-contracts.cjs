const { mkdir, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const domains = ['auth', 'catalog', 'content', 'reviews'];
const defaultBaseUrl =
  'https://raw.githubusercontent.com/longhdwst1full/dctd-utc/main/document/api/storefront';
const baseUrl = (process.env.SPORT_API_CONTRACT_BASE_URL || defaultBaseUrl).replace(/\/$/, '');
const outputDirectory = resolve(__dirname, '../contracts/storefront');

async function main() {
  const contracts = await Promise.all(
    domains.map(async (domain) => {
      const response = await fetch(`${baseUrl}/${domain}.yaml`);
      if (!response.ok) {
        throw new Error(`Cannot download ${domain}.yaml: HTTP ${response.status}`);
      }
      const content = await response.text();
      if (!/^openapi:\s*3\./m.test(content)) {
        throw new Error(`${domain}.yaml is not an OpenAPI 3 contract`);
      }
      return { domain, content };
    }),
  );

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    contracts.map(({ domain, content }) =>
      writeFile(resolve(outputDirectory, `${domain}.yaml`), content, 'utf8'),
    ),
  );
  console.log(`Synced ${contracts.length} Storefront API contracts from ${baseUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
