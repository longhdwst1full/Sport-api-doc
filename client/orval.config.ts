import { defineConfig } from 'orval';

export default defineConfig({
  commerce: {
    input: {
      target: '../api/openapi/openapi.json',
      filters: { mode: 'include', tags: [/^Storefront /] },
    },
    output: {
      target: './src/generated/api/endpoints.ts',
      schemas: './src/generated/api/models',
      mode: 'tags-split',
      client: 'react-query',
      clean: true,
      prettier: true,
      override: {
        mutator: { path: './src/lib/api/fetcher.ts', name: 'apiFetcher' },
        query: { useQuery: true, useMutation: true, signal: true },
      },
    },
  },
});
