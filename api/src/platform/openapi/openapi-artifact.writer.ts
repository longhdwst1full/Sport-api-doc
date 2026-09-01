import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OpenAPIObject } from '@nestjs/swagger';
import { stringify } from 'yaml';

interface ContractSlice {
  relativePath: string;
  tags: string[];
}

const CONTRACT_SLICES: ContractSlice[] = [
  { relativePath: 'admin/auth.yaml', tags: ['Admin Auth'] },
  { relativePath: 'admin/organization.yaml', tags: ['Admin Organization'] },
  { relativePath: 'admin/iam.yaml', tags: ['Admin IAM'] },
  { relativePath: 'admin/catalog.yaml', tags: ['Admin Catalog', 'Admin Products'] },
  { relativePath: 'admin/inventory.yaml', tags: ['Admin Inventory'] },
  { relativePath: 'admin/content.yaml', tags: ['Admin Content'] },
  { relativePath: 'admin/reviews.yaml', tags: ['Admin Reviews'] },
  { relativePath: 'admin/media.yaml', tags: ['Admin Media'] },
  { relativePath: 'admin/system.yaml', tags: ['Admin System'] },
  { relativePath: 'storefront/catalog.yaml', tags: ['Storefront Catalog'] },
  { relativePath: 'storefront/auth.yaml', tags: ['Storefront Auth'] },
  { relativePath: 'storefront/content.yaml', tags: ['Storefront Content'] },
  { relativePath: 'storefront/reviews.yaml', tags: ['Storefront Reviews'] },
];

function collectReferences(value: unknown, references: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferences(item, references));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string' && child.startsWith('#/components/')) {
      references.add(child);
    } else {
      collectReferences(child, references);
    }
  }
}

function createContractSlice(document: OpenAPIObject, includedTags: string[]): OpenAPIObject {
  const paths: OpenAPIObject['paths'] = {};
  for (const [path, pathItem] of Object.entries(document.paths)) {
    const selectedOperations = Object.fromEntries(
      Object.entries((pathItem ?? {}) as Record<string, unknown>).filter(([, operation]) => {
        if (!operation || typeof operation !== 'object' || !('tags' in operation)) return false;
        const candidateTags: unknown = operation.tags;
        if (!Array.isArray(candidateTags)) return false;
        return candidateTags.some(
          (tag: unknown) => typeof tag === 'string' && includedTags.includes(tag),
        );
      }),
    );
    if (Object.keys(selectedOperations).length > 0) paths[path] = selectedOperations;
  }

  const componentSource = (document.components ?? {}) as Record<string, Record<string, unknown>>;
  const componentOutput: Record<string, Record<string, unknown>> = {};
  const pendingReferences = new Set<string>();
  const handledReferences = new Set<string>();
  collectReferences(paths, pendingReferences);

  while (pendingReferences.size > 0) {
    const reference = pendingReferences.values().next().value as string;
    pendingReferences.delete(reference);
    if (handledReferences.has(reference)) continue;
    handledReferences.add(reference);

    const [, , section, name] = reference.split('/');
    const component = componentSource[section]?.[name];
    if (!component) continue;
    componentOutput[section] ??= {};
    componentOutput[section][name] = component;
    collectReferences(component, pendingReferences);
  }

  if (document.components?.securitySchemes) {
    componentOutput.securitySchemes = document.components.securitySchemes;
  }

  return {
    openapi: document.openapi,
    info: document.info,
    servers: document.servers,
    security: document.security,
    paths,
    components: componentOutput,
  };
}

function toYaml(document: OpenAPIObject): string {
  return `# Generated from NestJS decorators. Do not edit by hand.\n${stringify(document, {
    aliasDuplicateObjects: false,
    lineWidth: 0,
  })}`;
}

export async function writeOpenApiArtifacts(
  document: OpenAPIObject,
  apiRoot: string,
): Promise<void> {
  const apiOutputDirectory = resolve(apiRoot, 'openapi');
  const documentationDirectory = resolve(apiRoot, '..', 'document', 'api');
  const sliceDirectories = new Set(
    CONTRACT_SLICES.map(({ relativePath }) =>
      resolve(documentationDirectory, relativePath.split('/')[0]),
    ),
  );
  await Promise.all([
    mkdir(apiOutputDirectory, { recursive: true }),
    mkdir(documentationDirectory, { recursive: true }),
    ...Array.from(sliceDirectories, (directory) => mkdir(directory, { recursive: true })),
  ]);
  await Promise.all([
    writeFile(
      resolve(apiOutputDirectory, 'openapi.json'),
      `${JSON.stringify(document, null, 2)}\n`,
    ),
    writeFile(resolve(documentationDirectory, 'openapi-v1.yaml'), toYaml(document)),
    ...CONTRACT_SLICES.map(({ relativePath, tags }) =>
      writeFile(
        resolve(documentationDirectory, relativePath),
        toYaml(createContractSlice(document, tags)),
      ),
    ),
  ]);
}
