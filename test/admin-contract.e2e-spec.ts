import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApplication } from '../src/platform/app.factory';

describe('Admin v1 contract', () => {
  interface LookupBody {
    items: Array<{ code: string; label: string }>;
    meta: { page: number; limit: number; total: number; hasMore: boolean };
  }

  interface ErrorBody {
    statusCode: number;
    code: string;
    message: string;
    method: string;
    path: string;
    requestId?: string;
    details?: Array<{ field?: string; code: string; message: string }>;
  }

  let app: INestApplication;

  beforeAll(async () => {
    app = await createApplication({ logger: false, swagger: false });
  });

  afterAll(async () => app.close());

  const server = (): Parameters<typeof request>[0] => {
    const instance = app.getHttpServer() as unknown;
    return instance as Parameters<typeof request>[0];
  };

  it('serves active role search under the versioned API prefix', async () => {
    const response = await request(server())
      .get('/api/v1/admin/iam/roles/active')
      .query({ search: 'super', page: 1, limit: 20 })
      .set('x-permissions', 'iam.role.view')
      .expect(200);

    const body = response.body as unknown as LookupBody;
    expect(body.items).toEqual([
      expect.objectContaining({ code: 'SUPER_ADMIN', label: 'Super Admin' }),
    ]);
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 1, hasMore: false });
  });

  it('returns one canonical error shape for invalid lookup queries', async () => {
    const response = await request(server())
      .get('/api/v1/admin/iam/roles/active')
      .query({ limit: 100 })
      .set('x-permissions', 'iam.role.view')
      .expect(400);

    const body = response.body as unknown as ErrorBody;
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toBe('Request validation failed');
    expect(body.method).toBe('GET');
    expect(body.path).toBe('/api/v1/admin/iam/roles/active?limit=100');
    expect(typeof body.requestId).toBe('string');
    expect(body.details?.some((detail) => detail.field === 'limit')).toBe(true);
  });

  it('returns the same contract for authorization failures', async () => {
    const response = await request(server())
      .get('/api/v1/admin/iam/roles/active')
      .expect(403);

    const body = response.body as unknown as ErrorBody;
    expect(body.statusCode).toBe(403);
    expect(body.code).toBe('FORBIDDEN');
    expect(body.method).toBe('GET');
    expect(typeof body.requestId).toBe('string');
  });
});
