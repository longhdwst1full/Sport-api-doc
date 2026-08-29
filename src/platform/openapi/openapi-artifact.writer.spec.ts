import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAPIObject } from '@nestjs/swagger';
import { writeOpenApiArtifacts } from './openapi-artifact.writer';

describe('writeOpenApiArtifacts', () => {
  let temporaryRoot: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'dctd-openapi-'));
    await mkdir(join(temporaryRoot, 'api'));
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('writes domain contracts with only tagged operations and reachable schemas', async () => {
    const document: OpenAPIObject = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: {
        '/branches': {
          get: {
            operationId: 'listAdminBranches',
            tags: ['Admin Organization'],
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/BranchDto' },
                  },
                },
              },
            },
          },
        },
        '/roles': {
          get: {
            operationId: 'listAdminRoles',
            tags: ['Admin IAM'],
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/RoleDto' } },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          BranchDto: {
            type: 'object',
            properties: { address: { $ref: '#/components/schemas/AddressDto' } },
          },
          AddressDto: { type: 'object', properties: { province: { type: 'string' } } },
          RoleDto: { type: 'object', properties: { code: { type: 'string' } } },
        },
      },
    };

    await writeOpenApiArtifacts(document, join(temporaryRoot, 'api'));
    const organizationContract = await readFile(
      join(temporaryRoot, 'document', 'api', 'admin', 'organization.yaml'),
      'utf8',
    );

    expect(organizationContract).toContain('listAdminBranches');
    expect(organizationContract).toContain('BranchDto:');
    expect(organizationContract).toContain('AddressDto:');
    expect(organizationContract).not.toContain('listAdminRoles');
    expect(organizationContract).not.toContain('RoleDto:');
  });
});
