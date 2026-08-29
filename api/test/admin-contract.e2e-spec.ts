import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
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
  const prisma = new PrismaClient();
  const userId = uuidv7();
  const assignmentId = uuidv7();
  const staffUserId = uuidv7();
  const email = `e2e-${userId}@example.invalid`;
  const password = 'Valid-password-123!';
  let accessToken: string;
  const catalogFixture = {
    brandId: '',
    categoryId: '',
    productId: '',
    variantId: '',
  };

  beforeAll(async () => {
    const owner = await prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
    await prisma.user.create({
      data: {
        id: userId,
        userType: 'STAFF',
        email,
        normalizedEmail: email,
        passwordHash: await hash(password),
        displayName: 'E2E Owner',
        status: 'ACTIVE',
        permissionVersion: 1,
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: assignmentId,
        userId,
        roleId: owner.id,
        scopeType: 'GLOBAL',
        assignedBy: userId,
      },
    });
    await prisma.user.create({
      data: {
        id: staffUserId,
        userType: 'STAFF',
        email: `staff-${staffUserId}@example.invalid`,
        normalizedEmail: `staff-${staffUserId}@example.invalid`,
        displayName: 'E2E Staff',
        status: 'ACTIVE',
      },
    });
    app = await createApplication({ logger: false, swagger: false });
    const login = await request(server())
      .post('/api/v1/admin/auth/login')
      .send({ email, password })
      .expect(200);
    accessToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app.close();
    if (catalogFixture.variantId) {
      await prisma.productPrice.deleteMany({ where: { productVariantId: catalogFixture.variantId } });
    }
    if (catalogFixture.productId) {
      await prisma.productCategory.deleteMany({ where: { productId: catalogFixture.productId } });
      await prisma.productVariant.deleteMany({ where: { productId: catalogFixture.productId } });
      await prisma.product.deleteMany({ where: { id: catalogFixture.productId } });
    }
    if (catalogFixture.categoryId) {
      await prisma.category.deleteMany({ where: { id: catalogFixture.categoryId } });
    }
    if (catalogFixture.brandId) {
      await prisma.brand.deleteMany({ where: { id: catalogFixture.brandId } });
    }
    await prisma.authSession.deleteMany({ where: { userId } });
    await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: [userId, staffUserId] } } });
    await prisma.user.deleteMany({ where: { id: staffUserId } });
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE', deletedAt: new Date() },
    });
    await prisma.$disconnect();
  });

  const server = (): Parameters<typeof request>[0] => {
    const instance = app.getHttpServer() as unknown;
    return instance as Parameters<typeof request>[0];
  };

  it('serves active role search under the versioned API prefix', async () => {
    const response = await request(server())
      .get('/api/v1/admin/iam/roles/active')
      .query({ search: 'owner', page: 1, limit: 20 })
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as unknown as LookupBody;
    expect(body.items).toEqual([
      expect.objectContaining({ code: 'OWNER', label: 'Chủ cửa hàng' }),
    ]);
    expect(body.meta).toEqual({ page: 1, limit: 20, total: 1, hasMore: false });
  });

  it('returns one canonical error shape for invalid lookup queries', async () => {
    const response = await request(server())
      .get('/api/v1/admin/iam/roles/active')
      .query({ limit: 100 })
      .set('authorization', `Bearer ${accessToken}`)
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
      .set('x-permissions', 'iam.role.view')
      .expect(401);

    const body = response.body as unknown as ErrorBody;
    expect(body.statusCode).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.method).toBe('GET');
    expect(typeof body.requestId).toBe('string');
  });

  it('serializes duplicate role assignment and writes one atomic audit', async () => {
    const branch = await prisma.branch.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const sendAssignment = () =>
      request(server())
        .post(`/api/v1/admin/iam/users/${staffUserId}/role-assignments`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ roleCode: 'STAFF', scopeType: 'BRANCH', branchId: branch.id });

    const responses = await Promise.all([sendAssignment(), sendAssignment()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    await expect(
      prisma.userRoleAssignment.count({
        where: { userId: staffUserId, status: 'ACTIVE' },
      }),
    ).resolves.toBe(1);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: staffUserId } })).resolves.toMatchObject({
      permissionVersion: 1n,
    });
    await expect(
      prisma.auditLog.count({
        where: { action: 'iam.assignment.create', entityType: 'USER_ROLE_ASSIGNMENT' },
      }),
    ).resolves.toBeGreaterThanOrEqual(1);
  });

  it('delivers a published catalog from admin commands to storefront with optimistic locking', async () => {
    const suffix = uuidv7().replaceAll('-', '');
    const authorization = { authorization: `Bearer ${accessToken}` };
    const brandResponse = await request(server())
      .post('/api/v1/admin/catalog/brands')
      .set(authorization)
      .send({ code: `BR-${suffix.slice(-8)}`.toUpperCase(), name: 'E2E Brand', slug: `e2e-brand-${suffix}` })
      .expect(201);
    catalogFixture.brandId = (brandResponse.body as { id: string }).id;

    const categoryResponse = await request(server())
      .post('/api/v1/admin/catalog/categories')
      .set(authorization)
      .send({ code: `CAT-${suffix.slice(-8)}`.toUpperCase(), name: 'E2E Category', slug: `e2e-category-${suffix}` })
      .expect(201);
    catalogFixture.categoryId = (categoryResponse.body as { id: string }).id;

    const slug = `e2e-product-${suffix}`;
    const productResponse = await request(server())
      .post('/api/v1/admin/products')
      .set(authorization)
      .send({
        productNo: `SP-${suffix.slice(-8)}`.toUpperCase(),
        name: 'E2E Product',
        slug,
        brandId: catalogFixture.brandId,
        categoryIds: [catalogFixture.categoryId],
        primaryCategoryId: catalogFixture.categoryId,
      })
      .expect(201);
    catalogFixture.productId = (productResponse.body as { id: string }).id;

    const variantResponse = await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/variants`)
      .set(authorization)
      .send({ sku: `SKU-${suffix}`.toUpperCase(), name: 'Default SKU' })
      .expect(201);
    catalogFixture.variantId = (
      variantResponse.body as { variants: Array<{ id: string }> }
    ).variants[0].id;

    await request(server())
      .post(`/api/v1/admin/products/variants/${catalogFixture.variantId}/prices`)
      .set(authorization)
      .send({ amount: '1490000.00', startsAt: '2026-01-01T00:00:00.000Z' })
      .expect(201);

    await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/publish`)
      .set(authorization)
      .send({ expectedVersion: 0 })
      .expect(200);

    const storefront = await request(server())
      .get(`/api/v1/catalog/products/${slug}`)
      .expect(200);
    expect(storefront.body).toMatchObject({
      id: catalogFixture.productId,
      status: 'PUBLISHED',
      minPrice: '1490000.00',
    });

    const update = (name: string) =>
      request(server())
        .patch(`/api/v1/admin/products/${catalogFixture.productId}`)
        .set(authorization)
        .send({ name, expectedVersion: 1 });
    const updateResponses = await Promise.all([update('Winner A'), update('Winner B')]);
    expect(updateResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
  });
});
