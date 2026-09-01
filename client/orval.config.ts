import { defineConfig } from 'orval';

const CONTRACT_BASE = '../document/api/storefront';
const OUTPUT_BASE = './src/generated/api';

function createDomainConfig(domain: string) {
  return {
    input: { target: `${CONTRACT_BASE}/${domain}.yaml` },
    output: {
      target: `${OUTPUT_BASE}/${domain}/${domain}.ts`,
      schemas: `${OUTPUT_BASE}/${domain}/models`,
      mode: 'single' as const,
      client: 'react-query' as const,
      clean: true,
      prettier: true,
      override: {
        mutator: { path: './src/lib/api/fetcher.ts', name: 'apiFetcher' },
        query: { useQuery: true, useMutation: true, signal: true },
      },
    },
  };
}

export default defineConfig({
  auth: createDomainConfig('auth'),
  catalog: createDomainConfig('catalog'),
  content: createDomainConfig('content'),
  reviews: createDomainConfig('reviews'),
});
