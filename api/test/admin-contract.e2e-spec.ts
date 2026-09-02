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
  let createdStaffUserId = '';
  const email = `e2e-${userId}@example.invalid`;
  const password = 'Valid-password-123!';
  let accessToken: string;
  const catalogFixture = {
    brandId: '',
    categoryId: '',
    productId: '',
    variantId: '',
  };
  const organizationFixture = { branchId: '', warehouseId: '' };

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
      .send({ identifier: email, password })
      .expect(200);
    accessToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
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
    if (organizationFixture.warehouseId) {
      await prisma.warehouse.deleteMany({ where: { id: organizationFixture.warehouseId } });
    }
    if (organizationFixture.branchId) {
      await prisma.branch.deleteMany({ where: { id: organizationFixture.branchId } });
    }
    await prisma.authSession.deleteMany({ where: { userId } });
    if (createdStaffUserId) {
      await prisma.authSession.deleteMany({ where: { userId: createdStaffUserId } });
    }
    await prisma.userRoleAssignment.deleteMany({
      where: { userId: { in: [userId, staffUserId, createdStaffUserId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [staffUserId, createdStaffUserId].filter(Boolean) } },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
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

  it('creates an active branch staff account that can login with the approved default password', async () => {
    const branch = await prisma.branch.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const staffEmail = `created-staff-${uuidv7()}@example.invalid`;
    const created = await request(server())
      .post('/api/v1/admin/iam/users')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        displayName: 'E2E Created Staff',
        email: staffEmail,
        roleCode: 'STAFF',
        branchId: branch.id,
      })
      .expect(201);
    createdStaffUserId = (created.body as { id: string }).id;
    expect(created.body).toMatchObject({
      displayName: 'E2E Created Staff',
      status: 'ACTIVE',
      permissionVersion: 1,
      assignments: [expect.objectContaining({ roleCode: 'STAFF', branchId: branch.id })],
    });
    expect(created.body).not.toHaveProperty('password');
    expect(created.body).not.toHaveProperty('passwordHash');

    const staffLogin = await request(server())
      .post('/api/v1/admin/auth/login')
      .send({ identifier: staffEmail, password: 'Aa@123456' })
      .expect(200);
    const oldAccessToken = (staffLogin.body as { accessToken: string }).accessToken;
    const oldRefreshToken = (staffLogin.body as { refreshToken: string }).refreshToken;

    const locked = await request(server())
      .post(`/api/v1/admin/iam/users/${createdStaffUserId}/lock`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ reason: 'E2E lifecycle verification' })
      .expect(200);
    expect(locked.body).toMatchObject({ status: 'LOCKED', permissionVersion: 2 });
    await request(server())
      .get('/api/v1/admin/iam/users')
      .set('authorization', `Bearer ${oldAccessToken}`)
      .expect(401);
    await request(server())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
    await request(server())
      .post('/api/v1/admin/auth/login')
      .send({ identifier: staffEmail, password: 'Aa@123456' })
      .expect(401);
    await expect(
      prisma.authSession.count({
        where: { userId: createdStaffUserId, revokedAt: null },
      }),
    ).resolves.toBe(0);

    const unlocked = await request(server())
      .post(`/api/v1/admin/iam/users/${createdStaffUserId}/unlock`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(unlocked.body).toMatchObject({ status: 'ACTIVE', permissionVersion: 3 });
    await request(server())
      .post('/api/v1/admin/auth/login')
      .send({ identifier: staffEmail, password: 'Aa@123456' })
      .expect(200);
    await expect(
      prisma.auditLog.count({ where: { action: 'iam.user.create', entityId: createdStaffUserId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { action: 'iam.user.lock', entityId: createdStaffUserId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { action: 'iam.user.unlock', entityId: createdStaffUserId } }),
    ).resolves.toBe(1);
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
    const updatedBrand = await request(server())
      .patch(`/api/v1/admin/catalog/brands/${catalogFixture.brandId}`)
      .set(authorization)
      .send({ name: 'E2E Brand Updated', expectedVersion: 0 })
      .expect(200);
    expect(updatedBrand.body).toMatchObject({ name: 'E2E Brand Updated', version: 1 });
    await request(server())
      .post(`/api/v1/admin/catalog/brands/${catalogFixture.brandId}/deactivate`)
      .set(authorization)
      .send({ expectedVersion: 1 })
      .expect(200);
    await request(server())
      .post(`/api/v1/admin/catalog/brands/${catalogFixture.brandId}/activate`)
      .set(authorization)
      .send({ expectedVersion: 2 })
      .expect(200);

    const categoryResponse = await request(server())
      .post('/api/v1/admin/catalog/categories')
      .set(authorization)
      .send({ code: `CAT-${suffix.slice(-8)}`.toUpperCase(), name: 'E2E Category', slug: `e2e-category-${suffix}` })
      .expect(201);
    catalogFixture.categoryId = (categoryResponse.body as { id: string }).id;
    const updatedCategory = await request(server())
      .patch(`/api/v1/admin/catalog/categories/${catalogFixture.categoryId}`)
      .set(authorization)
      .send({ name: 'E2E Category Updated', expectedVersion: 0 })
      .expect(200);
    expect(updatedCategory.body).toMatchObject({ name: 'E2E Category Updated', version: 1 });

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

    await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/archive`)
      .set(authorization)
      .send({ expectedVersion: 2 })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'ARCHIVED', version: 3 }));
    await request(server()).get(`/api/v1/catalog/products/${slug}`).expect(404);

    await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/reactivate`)
      .set(authorization)
      .send({ expectedVersion: 3 })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'DRAFT', version: 4 }));
    await request(server()).get(`/api/v1/catalog/products/${slug}`).expect(404);

    await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/publish`)
      .set(authorization)
      .send({ expectedVersion: 4 })
      .expect(200);
    await request(server())
      .post(`/api/v1/admin/products/variants/${catalogFixture.variantId}/archive`)
      .set(authorization)
      .send({ expectedVersion: 0 })
      .expect(200);
    await request(server()).get(`/api/v1/catalog/products/${slug}`).expect(404);

    await request(server())
      .post(`/api/v1/admin/products/variants/${catalogFixture.variantId}/reactivate`)
      .set(authorization)
      .send({ expectedVersion: 1 })
      .expect(200);
    await request(server()).get(`/api/v1/catalog/products/${slug}`).expect(200);
  });

  it('creates, updates and changes branch plus warehouse status atomically', async () => {
    const suffix = uuidv7().replaceAll('-', '').slice(-8).toUpperCase();
    const authorization = { authorization: `Bearer ${accessToken}` };
    const created = await request(server())
      .post('/api/v1/admin/organization/branches')
      .set(authorization)
      .send({
        code: `CN-${suffix}`,
        name: 'E2E Branch',
        address: { addressLine: '1 E2E Street', district: 'Hải Châu', province: 'Đà Nẵng' },
        warehouse: { code: `KHO-${suffix}`, name: 'E2E Warehouse' },
      })
      .expect(201);
    const createdBody = created.body as {
      branch: { id: string; version: number };
      warehouse: { id: string; version: number };
    };
    organizationFixture.branchId = createdBody.branch.id;
    organizationFixture.warehouseId = createdBody.warehouse.id;

    const updated = await request(server())
      .patch(`/api/v1/admin/organization/branches/${organizationFixture.branchId}`)
      .set(authorization)
      .send({
        name: 'E2E Branch Updated',
        address: { addressLine: '2 E2E Street', district: 'Hải Châu', province: 'Đà Nẵng' },
        warehouse: { name: 'E2E Warehouse Updated' },
        expectedVersion: 0,
        warehouseExpectedVersion: 0,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      branch: { name: 'E2E Branch Updated', version: 1 },
      warehouse: { name: 'E2E Warehouse Updated', version: 1 },
    });

    const inactive = await request(server())
      .post(`/api/v1/admin/organization/branches/${organizationFixture.branchId}/deactivate`)
      .set(authorization)
      .send({ expectedVersion: 1, warehouseExpectedVersion: 1 })
      .expect(200);
    expect(inactive.body).toMatchObject({
      branch: { status: 'INACTIVE', version: 2 },
      warehouse: { status: 'INACTIVE', version: 2 },
    });

    await request(server())
      .post(`/api/v1/admin/organization/branches/${organizationFixture.branchId}/activate`)
      .set(authorization)
      .send({ expectedVersion: 2, warehouseExpectedVersion: 2 })
      .expect(200);
  });
});
