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
  const fixtureSuffix = uuidv7();
  let userId: bigint;
  let staffUserId: bigint;
  let createdStaffUserId = '';
  const email = `e2e-${fixtureSuffix}@example.invalid`;
  const password = 'Valid-password-123!';
  let accessToken: string;
  const catalogFixture = {
    brandId: '',
    categoryId: '',
    productId: '',
    variantId: '',
    mediaAssetId: '',
  };
  const concurrencyProductIds: string[] = [];
  let concurrencyCategoryId = '';
  let idempotencyCategoryId = '';
  const attributeCodes: string[] = [];
  const organizationFixture = { branchId: '', warehouseId: '' };

  beforeAll(async () => {
    const owner = await prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
    const ownerUser = await prisma.user.create({
      data: {
        userType: 'STAFF',
        email,
        normalizedEmail: email,
        passwordHash: await hash(password),
        displayName: 'E2E Owner',
        status: 'ACTIVE',
        permissionVersion: 1,
      },
    });
    userId = ownerUser.id;
    await prisma.userRoleAssignment.create({
      data: {
        userId,
        roleId: owner.id,
        scopeType: 'GLOBAL',
        assignedBy: userId,
      },
    });
    const staffUser = await prisma.user.create({
      data: {
        userType: 'STAFF',
        email: `staff-${fixtureSuffix}@example.invalid`,
        normalizedEmail: `staff-${fixtureSuffix}@example.invalid`,
        displayName: 'E2E Staff',
        status: 'ACTIVE',
      },
    });
    staffUserId = staffUser.id;
    app = await createApplication({ logger: false, swagger: false });
    const login = await request(server())
      .post('/api/v1/admin/auth/login')
      .send({ identifier: email, password })
      .expect(200);
    accessToken = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (catalogFixture.productId) {
      await prisma.productPrice.deleteMany({
        where: { productVariant: { productId: BigInt(catalogFixture.productId) } },
      });
      await prisma.productMedia.deleteMany({ where: { productId: BigInt(catalogFixture.productId) } });
      await prisma.productCategory.deleteMany({ where: { productId: BigInt(catalogFixture.productId) } });
      await prisma.productVariant.deleteMany({ where: { productId: BigInt(catalogFixture.productId) } });
      await prisma.product.deleteMany({ where: { id: BigInt(catalogFixture.productId) } });
    }
    if (catalogFixture.mediaAssetId) {
      await prisma.mediaAsset.deleteMany({ where: { id: BigInt(catalogFixture.mediaAssetId) } });
    }
    if (concurrencyProductIds.length > 0) {
      const variants = await prisma.productVariant.findMany({
        where: { productId: { in: concurrencyProductIds.map(BigInt) } },
        select: { id: true },
      });
      const variantIds = variants.map(({ id }) => id);
      await prisma.productPrice.deleteMany({ where: { productVariantId: { in: variantIds } } });
      const bundles = await prisma.productBundle.findMany({
        where: { bundleVariantId: { in: variantIds } },
        select: { id: true },
      });
      await prisma.bundleItem.deleteMany({
        where: { productBundleId: { in: bundles.map(({ id }) => id) } },
      });
      await prisma.productBundle.deleteMany({ where: { id: { in: bundles.map(({ id }) => id) } } });
      await prisma.productCategory.deleteMany({ where: { productId: { in: concurrencyProductIds.map(BigInt) } } });
      await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
      await prisma.product.deleteMany({ where: { id: { in: concurrencyProductIds.map(BigInt) } } });
    }
    if (concurrencyCategoryId) {
      await prisma.category.deleteMany({ where: { id: BigInt(concurrencyCategoryId) } });
    }
    if (attributeCodes.length > 0) {
      await prisma.attribute.deleteMany({ where: { code: { in: attributeCodes } } });
    }
    if (idempotencyCategoryId) {
      await prisma.category.deleteMany({ where: { id: BigInt(idempotencyCategoryId) } });
    }
    if (catalogFixture.categoryId) {
      await prisma.category.deleteMany({ where: { id: BigInt(catalogFixture.categoryId) } });
    }
    if (catalogFixture.brandId) {
      await prisma.brand.deleteMany({ where: { id: BigInt(catalogFixture.brandId) } });
    }
    if (organizationFixture.warehouseId) {
      await prisma.warehouse.deleteMany({ where: { id: BigInt(organizationFixture.warehouseId) } });
    }
    if (organizationFixture.branchId) {
      await prisma.branch.deleteMany({ where: { id: BigInt(organizationFixture.branchId) } });
    }
    await prisma.authSession.deleteMany({ where: { userId } });
    if (createdStaffUserId) {
      await prisma.authSession.deleteMany({ where: { userId: BigInt(createdStaffUserId) } });
    }
    await prisma.userRoleAssignment.deleteMany({
      where: { userId: { in: [userId, staffUserId, ...(createdStaffUserId ? [BigInt(createdStaffUserId)] : [])] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [staffUserId, ...(createdStaffUserId ? [BigInt(createdStaffUserId)] : [])] } },
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
      .query({ search: 'quản lý', page: 1, limit: 20 })
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const body = response.body as unknown as LookupBody;
    expect(body.items).toEqual([
      expect.objectContaining({ code: 'BRANCH_MANAGER', label: 'Quản lý chi nhánh' }),
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
    expect(body.message).toBe('Dữ liệu gửi lên không hợp lệ.');
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

  it('persists stock adjustments idempotently and writes audit evidence', async () => {
    const idempotencyKey = `e2e-stock-${uuidv7()}`;
    const payload = {
      warehouseCode: 'KHO-HCM-01',
      reason: 'E2E kiểm kê Sprint 1',
      items: [{ sku: 'TA-CAO-SU-5KG', quantityDelta: 1 }],
    };

    const balancesBefore = await request(server())
      .get('/api/v1/admin/inventory/balances')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    const before = (
      balancesBefore.body as { items: Array<{ sku: string; onHand: number }> }
    ).items.find(({ sku }) => sku === 'TA-CAO-SU-5KG');
    expect(before).toBeDefined();

    const posted = await request(server())
      .post('/api/v1/admin/inventory/adjustments')
      .set('authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201);
    expect(posted.body).toMatchObject({
      status: 'POSTED',
      reason: payload.reason,
      balances: [expect.objectContaining({
        sku: 'TA-CAO-SU-5KG',
        onHand: (before?.onHand ?? 0) + 1,
      })],
    });

    const replay = await request(server())
      .post('/api/v1/admin/inventory/adjustments')
      .set('authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload)
      .expect(201);
    expect(replay.body).toEqual(posted.body);

    const nextPosted = await request(server())
      .post('/api/v1/admin/inventory/adjustments')
      .set('authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', `e2e-stock-${uuidv7()}`)
      .send(payload)
      .expect(201);
    const postedBody = posted.body as { adjustmentNo: string };
    const nextPostedBody = nextPosted.body as { adjustmentNo: string };
    expect(nextPostedBody.adjustmentNo).not.toBe(postedBody.adjustmentNo);

    const adjustmentList = await request(server())
      .get('/api/v1/admin/inventory/adjustments')
      .query({ warehouseCode: payload.warehouseCode, limit: 25 })
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    const adjustmentSummary = (
      adjustmentList.body as { items: Array<{ id: string; adjustmentNo: string }> }
    ).items.find(({ adjustmentNo }) => adjustmentNo === postedBody.adjustmentNo);
    expect(adjustmentSummary).toBeDefined();

    const adjustmentDetail = await request(server())
      .get(`/api/v1/admin/inventory/adjustments/${adjustmentSummary?.id}`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(adjustmentDetail.body).toMatchObject({
      adjustmentNo: postedBody.adjustmentNo,
      items: [expect.objectContaining({ sku: 'TA-CAO-SU-5KG' })],
    });

    const movements = await request(server())
      .get('/api/v1/admin/inventory/movements')
      .query({ warehouseCode: payload.warehouseCode, sku: 'TA-CAO-SU-5KG', limit: 1 })
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    const movementBody = movements.body as unknown as {
      items: Array<{ id: string; movementType: string; referenceId: string }>;
      nextCursor: string | null;
    };
    expect(movementBody.items).toHaveLength(1);
    expect(movementBody.nextCursor).toEqual(expect.any(String));

    const nextMovements = await request(server())
      .get('/api/v1/admin/inventory/movements')
      .query({
        warehouseCode: payload.warehouseCode,
        sku: 'TA-CAO-SU-5KG',
        limit: 1,
        cursor: movementBody.nextCursor,
      })
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    const nextMovementBody = nextMovements.body as unknown as {
      items: Array<{ id: string; movementType: string; referenceId: string }>;
      nextCursor: string | null;
    };
    expect(nextMovementBody.items).toHaveLength(1);
    expect(nextMovementBody.items[0]?.id).not.toBe(movementBody.items[0]?.id);
    expect([...movementBody.items, ...nextMovementBody.items].some((item) =>
      item.movementType === 'ADJUST' && item.referenceId === adjustmentSummary?.id,
    )).toBe(true);

    await request(server())
      .get('/api/v1/admin/inventory/movements')
      .query({ cursor: 'invalid' })
      .set('authorization', `Bearer ${accessToken}`)
      .expect(400);

    await request(server())
      .post('/api/v1/admin/inventory/adjustments')
      .set('authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...payload, items: [{ sku: 'TA-CAO-SU-5KG', quantityDelta: 2 }] })
      .expect(409);

    await expect(prisma.auditLog.count({
      where: { action: 'inventory.stock_adjustment.post', actorUserId: userId },
    })).resolves.toBeGreaterThanOrEqual(2);
  });

  it('serializes duplicate role assignment and revokes the winner atomically', async () => {
    const branch = await prisma.branch.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const sendAssignment = () =>
      request(server())
        .post(`/api/v1/admin/iam/users/${staffUserId}/role-assignments`)
        .set('authorization', `Bearer ${accessToken}`)
        .send({ roleCode: 'STAFF', scopeType: 'BRANCH', branchId: branch.id.toString() });

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

    const activeAssignment = await prisma.userRoleAssignment.findFirstOrThrow({
      where: { userId: staffUserId, status: 'ACTIVE' },
    });
    const revoked = await request(server())
      .post(`/api/v1/admin/iam/users/${staffUserId}/role-assignments/${activeAssignment.id}/revoke`)
      .set('authorization', `Bearer ${accessToken}`)
      .send({ reason: 'E2E assignment revoke' })
      .expect(200);
    expect(revoked.body).toMatchObject({ permissionVersion: 2, assignments: [] });
    await expect(prisma.userRoleAssignment.findUniqueOrThrow({ where: { id: activeAssignment.id } }))
      .resolves.toMatchObject({ status: 'REVOKED' });
    await expect(
      prisma.auditLog.count({
        where: { action: 'iam.assignment.revoke', entityId: activeAssignment.id.toString() },
      }),
    ).resolves.toBe(1);
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
        branchId: branch.id.toString(),
      })
      .expect(201);
    createdStaffUserId = (created.body as { id: string }).id;
    expect(created.body).toMatchObject({
      displayName: 'E2E Created Staff',
      status: 'ACTIVE',
      permissionVersion: 1,
      assignments: [expect.objectContaining({ roleCode: 'STAFF', branchId: branch.id.toString() })],
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
        where: { userId: BigInt(createdStaffUserId), revokedAt: null },
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

    const productResponse = await request(server())
      .post('/api/v1/admin/products')
      .set(authorization)
      .send({
        name: 'E2E Product',
        brandId: catalogFixture.brandId,
        categoryIds: [catalogFixture.categoryId],
        primaryCategoryId: catalogFixture.categoryId,
        variants: [{ name: 'Default SKU' }],
      })
      .expect(201);
    const createdProduct = productResponse.body as {
      id: string;
      productNo: string;
      slug: string;
      variants: Array<{ id: string; name: string; sku: string }>;
    };
    catalogFixture.productId = createdProduct.id;
    const slug = createdProduct.slug;
    expect(createdProduct.productNo).toMatch(/^PRD-[A-F0-9]{24}$/);
    expect(slug).toMatch(/^e2e-product-prd-[a-f0-9]{24}$/);

    const createdVariant = createdProduct.variants.find(({ name }) => name === 'Default SKU');
    // SKU bỏ trống → mã ngắn 8 ký tự không nhầm lẫn (BR-SKU-02, 2026-09-25).
    expect(createdVariant?.sku).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    catalogFixture.variantId = createdVariant!.id;

    const updatedVariant = await request(server())
      .patch(`/api/v1/admin/products/variants/${catalogFixture.variantId}`)
      .set(authorization)
      .send({
        name: 'Default SKU Updated',
        barcode: `BAR-${suffix}`.toUpperCase(),
        weightGrams: 1250,
        lengthMm: 400,
        widthMm: 200,
        heightMm: 150,
        expectedVersion: 0,
      })
      .expect(200);
    expect(updatedVariant.body).toMatchObject({
      variants: [expect.objectContaining({
        id: catalogFixture.variantId,
        name: 'Default SKU Updated',
        weightGrams: 1250,
        version: 1,
      })],
    });

    const mediaSuffix = uuidv7();
    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        provider: 'CLOUDINARY',
        providerAssetId: `e2e-${mediaSuffix}`,
        publicId: `sport-sys/sport/e2e-${mediaSuffix}`,
        secureUrl: 'https://example.invalid/e2e-product.webp',
        thumbnailUrl: 'https://example.invalid/e2e-product-thumb.webp',
        status: 'ACTIVE',
        uploadedBy: userId,
      },
    });
    catalogFixture.mediaAssetId = mediaAsset.id.toString();
    const attachedMedia = await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/media`)
      .set(authorization)
      .send({
        mediaAssetId: catalogFixture.mediaAssetId,
        altText: 'E2E product front',
        isPrimary: true,
        expectedProductVersion: 0,
      })
      .expect(201);
    const productMediaId = (attachedMedia.body as Array<{ id: string }>)[0].id;
    await request(server())
      .patch(`/api/v1/admin/products/${catalogFixture.productId}/media/${productMediaId}`)
      .set(authorization)
      .send({ altText: 'E2E product front updated', expectedProductVersion: 1 })
      .expect(200);
    await request(server())
      .patch(`/api/v1/admin/products/${catalogFixture.productId}/media/reorder`)
      .set(authorization)
      .send({ items: [{ id: productMediaId, sortOrder: 0 }], expectedProductVersion: 2 })
      .expect(200);

    const initialPrice = await request(server())
      .post(`/api/v1/admin/products/variants/${catalogFixture.variantId}/prices`)
      .set(authorization)
      .send({ amount: '1490000.00', startsAt: new Date(Date.now() - 1_000).toISOString() })
      .expect(201);
    const initialVariant = (
      initialPrice.body as {
        variants: Array<{
          id: string;
          effectivePriceId: string;
          effectivePriceVersion: number;
        }>;
      }
    ).variants.find(({ id }) => id === catalogFixture.variantId);
    expect(initialVariant).toBeDefined();

    await request(server())
      .post(`/api/v1/admin/products/variants/${catalogFixture.variantId}/prices`)
      .set(authorization)
      .send({ amount: '0.00', startsAt: new Date(Date.now() - 1_000).toISOString() })
      .expect(400);

    await request(server())
      .post(`/api/v1/admin/products/variants/${catalogFixture.variantId}/prices/replace`)
      .set(authorization)
      .send({
        amount: '1590000.00',
        startsAt: new Date(Date.now() - 1_000).toISOString(),
        expectedCurrentPriceId: initialVariant?.effectivePriceId,
        expectedCurrentPriceVersion: initialVariant?.effectivePriceVersion,
      })
      .expect(201);

    const inactiveVariantResponse = await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/variants`)
      .set(authorization)
      .send({ name: 'Inactive cheap SKU' })
      .expect(201);
    const inactiveVariantId = (
      inactiveVariantResponse.body as { variants: Array<{ id: string; name: string }> }
    ).variants.find(({ name }) => name === 'Inactive cheap SKU')?.id;
    expect(inactiveVariantId).toBeDefined();
    await request(server())
      .post(`/api/v1/admin/products/variants/${inactiveVariantId}/prices`)
      .set(authorization)
      .send({ amount: '1.00', startsAt: new Date(Date.now() - 1_000).toISOString() })
      .expect(201);
    await request(server())
      .post(`/api/v1/admin/products/variants/${inactiveVariantId}/archive`)
      .set(authorization)
      .send({ expectedVersion: 0 })
      .expect(200);

    await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/publish`)
      .set(authorization)
      .send({ expectedVersion: 3 })
      .expect(200);

    const storefront = await request(server())
      .get(`/api/v1/catalog/products/${slug}`)
      .expect(200);
    expect(storefront.body).toMatchObject({
      id: catalogFixture.productId,
      status: 'PUBLISHED',
      minPrice: '1590000.00',
      imageUrl: 'https://example.invalid/e2e-product.webp',
    });
    expect((storefront.body as { variants: Array<{ id: string }> }).variants).toEqual([
      expect.objectContaining({ id: catalogFixture.variantId }),
    ]);

    const update = (name: string) =>
      request(server())
        .patch(`/api/v1/admin/products/${catalogFixture.productId}`)
        .set(authorization)
        .send({ name, expectedVersion: 4 });
    const updateResponses = await Promise.all([update('Winner A'), update('Winner B')]);
    expect(updateResponses.map(({ status }) => status).sort()).toEqual([200, 409]);

    await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/archive`)
      .set(authorization)
      .send({ expectedVersion: 5 })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'ARCHIVED', version: 6 }));
    await request(server()).get(`/api/v1/catalog/products/${slug}`).expect(404);

    await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/reactivate`)
      .set(authorization)
      .send({ expectedVersion: 6 })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'DRAFT', version: 7 }));
    await request(server()).get(`/api/v1/catalog/products/${slug}`).expect(404);

    await request(server())
      .post(`/api/v1/admin/products/${catalogFixture.productId}/publish`)
      .set(authorization)
      .send({ expectedVersion: 7 })
      .expect(200);
    await request(server())
      .post(`/api/v1/admin/products/variants/${catalogFixture.variantId}/archive`)
      .set(authorization)
      .send({ expectedVersion: 1 })
      .expect(200);
    await request(server()).get(`/api/v1/catalog/products/${slug}`).expect(404);

    await request(server())
      .post(`/api/v1/admin/products/variants/${catalogFixture.variantId}/reactivate`)
      .set(authorization)
      .send({ expectedVersion: 2 })
      .expect(200);
    await request(server()).get(`/api/v1/catalog/products/${slug}`).expect(200);
  });

  it('serializes combo publish against component archive and preserves sellability', async () => {
    const suffix = uuidv7().replaceAll('-', '').slice(-8).toUpperCase();
    const authorization = { authorization: `Bearer ${accessToken}` };
    const categoryResponse = await request(server())
      .post('/api/v1/admin/catalog/categories')
      .set(authorization)
      .send({
        code: `CON-${suffix}`,
        name: 'Concurrency category',
        slug: `concurrency-${suffix.toLowerCase()}`,
      })
      .expect(201);
    concurrencyCategoryId = (categoryResponse.body as { id: string }).id;
    const createProduct = async (kind: 'STANDARD' | 'BUNDLE', label: string) => {
      const response = await request(server())
        .post('/api/v1/admin/products')
        .set(authorization)
        .send({
          productType: kind,
          name: `${label} ${kind}`,
          categoryIds: [concurrencyCategoryId],
          primaryCategoryId: concurrencyCategoryId,
          variants: [{ name: `${label} SKU` }],
        })
        .expect(201);
      const created = response.body as {
        id: string;
        variants: Array<{ id: string; name: string; sku: string }>;
      };
      const id = created.id;
      concurrencyProductIds.push(id);
      return { id, variant: created.variants[0] };
    };

    const componentProduct = await createProduct('STANDARD', 'COMPONENT');
    const componentVariant = componentProduct.variant;
    const componentVariantId = componentVariant.id;

    const comboProduct = await createProduct('BUNDLE', 'COMBO');
    const comboProductId = comboProduct.id;
    const comboVariant = comboProduct.variant;
    const comboVariantId = comboVariant.id;
    const activeVariants = await request(server())
      .get(`/api/v1/admin/products/variants/active?search=${componentVariant.sku}&page=1&limit=20`)
      .set(authorization)
      .expect(200);
    expect(
      (activeVariants.body as LookupBody).items.map(({ code }) => code),
    ).toContain(componentVariant.sku);
    expect(
      (activeVariants.body as LookupBody).items.map(({ code }) => code),
    ).not.toContain(comboVariant.sku);
    await request(server())
      .post(`/api/v1/admin/products/variants/${comboVariantId}/prices`)
      .set(authorization)
      .send({ amount: '900000.00', startsAt: new Date(Date.now() - 1_000).toISOString() })
      .expect(201);
    const bundleResponse = await request(server())
      .post(`/api/v1/admin/products/${comboProductId}/bundle`)
      .set(authorization)
      .send({
        bundleVariantId: comboVariantId,
        items: [{ componentVariantId, quantity: 2 }],
      })
      .expect(201);
    expect(
      (
        bundleResponse.body as {
          variants: Array<{ id: string; bundle?: { components: unknown[] } }>;
        }
      ).variants.find(({ id }) => id === comboVariantId)?.bundle?.components,
    ).toHaveLength(1);

    const [publishResponse, archiveResponse] = await Promise.all([
      request(server())
        .post(`/api/v1/admin/products/${comboProductId}/publish`)
        .set(authorization)
        .send({ expectedVersion: 0 }),
      request(server())
        .post(`/api/v1/admin/products/variants/${componentVariantId}/archive`)
        .set(authorization)
        .send({ expectedVersion: 0 }),
    ]);
    expect([publishResponse.status, archiveResponse.status].sort()).toEqual([200, 422]);

    const [combo, component] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: BigInt(comboProductId) } }),
      prisma.productVariant.findUniqueOrThrow({ where: { id: BigInt(componentVariantId) } }),
    ]);
    expect(combo.status === 'PUBLISHED' && component.status === 'INACTIVE').toBe(false);
  });

  it('replays createAdminProduct by x-request-id and rejects a reused key with another payload', async () => {
    const suffix = uuidv7().replaceAll('-', '').slice(-8).toUpperCase();
    const authorization = { authorization: `Bearer ${accessToken}` };
    const categoryResponse = await request(server())
      .post('/api/v1/admin/catalog/categories')
      .set(authorization)
      .send({ code: `IDEM-${suffix}`, name: 'Idempotency category', slug: `idempotency-${suffix.toLowerCase()}` })
      .expect(201);
    idempotencyCategoryId = (categoryResponse.body as { id: string }).id;
    const body = (name: string) => ({
      name,
      categoryIds: [idempotencyCategoryId],
      primaryCategoryId: idempotencyCategoryId,
      variants: [{ name: `${name} SKU`, weightGrams: 1200 }],
    });
    const create = (requestId: string, payload: ReturnType<typeof body>) =>
      request(server()).post('/api/v1/admin/products').set(authorization).set('x-request-id', requestId).send(payload);
    const productIdsFor = async (name: string) =>
      (await prisma.product.findMany({ where: { name }, select: { id: true } })).map(({ id }) => id.toString());

    // Lần gửi lại tuần tự (mất response rồi bấm lại): cùng khoá, cùng payload → cùng sản phẩm.
    const sequentialKey = `e2e-product-${uuidv7()}`;
    const sequentialName = `Idempotent product ${suffix}`;
    const first = await create(sequentialKey, body(sequentialName)).expect(201);
    const firstId = (first.body as { id: string }).id;
    concurrencyProductIds.push(firstId);
    const replay = await create(sequentialKey, body(sequentialName)).expect(201);
    expect((replay.body as { id: string; productNo: string }).id).toBe(firstId);
    expect((replay.body as { productNo: string }).productNo).toBe((first.body as { productNo: string }).productNo);
    expect(await productIdsFor(sequentialName)).toEqual([firstId]);

    // Cùng khoá nhưng dữ liệu khác → 409, không tạo thêm.
    const conflict = await create(sequentialKey, body(`${sequentialName} changed`)).expect(409);
    expect((conflict.body as ErrorBody).code).toBe('PRODUCT_IDEMPOTENCY_CONFLICT');
    expect(await productIdsFor(`${sequentialName} changed`)).toEqual([]);

    // Hai request song song cùng khoá: advisory lock bắt chạy tuần tự → đúng một sản phẩm.
    const parallelKey = `e2e-product-${uuidv7()}`;
    const parallelName = `Parallel product ${suffix}`;
    const responses = await Promise.all([
      create(parallelKey, body(parallelName)),
      create(parallelKey, body(parallelName)),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    const parallelIds = responses.map(({ body: created }) => (created as { id: string }).id);
    concurrencyProductIds.push(...new Set(parallelIds));
    expect(new Set(parallelIds).size).toBe(1);
    expect(await productIdsFor(parallelName)).toEqual([parallelIds[0]]);
    const productAudits = await prisma.auditLog.count({
      where: { requestId: parallelKey, action: 'catalog.product.create' },
    });
    expect(productAudits).toBe(1);

    // Không gửi khoá: giữ hành vi cũ, mỗi lần gọi tạo một sản phẩm mới.
    const withoutKeyName = `Keyless product ${suffix}`;
    const keyless = await Promise.all([
      request(server()).post('/api/v1/admin/products').set(authorization).send(body(withoutKeyName)).expect(201),
      request(server()).post('/api/v1/admin/products').set(authorization).send(body(withoutKeyName)).expect(201),
    ]);
    concurrencyProductIds.push(...keyless.map(({ body: created }) => (created as { id: string }).id));
    expect(await productIdsFor(withoutKeyName)).toHaveLength(2);

    await create('x'.repeat(101), body(`Too long key ${suffix}`)).expect(400);
  });

  it('creates product, SKU and initial price in one transaction and rolls everything back on a bad media asset', async () => {
    const suffix = uuidv7().replaceAll('-', '').slice(-8).toUpperCase();
    const authorization = { authorization: `Bearer ${accessToken}` };
    const categoryId = idempotencyCategoryId || ((await request(server())
      .post('/api/v1/admin/catalog/categories')
      .set(authorization)
      .send({ code: `SET-${suffix}`, name: 'Setup category', slug: `setup-${suffix.toLowerCase()}` })
      .expect(201)).body as { id: string }).id;
    if (!idempotencyCategoryId) idempotencyCategoryId = categoryId;

    const created = await request(server())
      .post('/api/v1/admin/products')
      .set(authorization)
      .send({
        name: `Setup product ${suffix}`,
        categoryIds: [categoryId],
        primaryCategoryId: categoryId,
        variants: [{ name: 'Standard', initialPriceAmount: '7800000' }],
      })
      .expect(201);
    const product = created.body as { id: string; variants: Array<{ id: string }> };
    concurrencyProductIds.push(product.id);
    const prices = await prisma.productPrice.findMany({ where: { productVariantId: BigInt(product.variants[0].id) } });
    expect(prices.map(({ amount, status }) => ({ amount: amount.toFixed(0), status }))).toEqual([{ amount: '7800000', status: 'ACTIVE' }]);

    // Asset không tồn tại → 422 và KHÔNG còn sản phẩm/SKU/giá nào sót lại (không có sản phẩm dở dang).
    const brokenName = `Broken setup ${suffix}`;
    await request(server())
      .post('/api/v1/admin/products')
      .set(authorization)
      .send({
        name: brokenName,
        categoryIds: [categoryId],
        primaryCategoryId: categoryId,
        variants: [{ name: 'Standard', initialPriceAmount: '100000' }],
        media: [{ mediaAssetId: '999999999999' }],
      })
      .expect(422);
    expect(await prisma.product.count({ where: { name: brokenName } })).toBe(0);

    // SKU nhập tay: lưu đúng mã cửa hàng (tự viết hoa); dùng lại mã đã có → 409 từ unique constraint.
    const manualSku = `e2e-${suffix}`.toUpperCase();
    const manual = await request(server())
      .post('/api/v1/admin/products')
      .set(authorization)
      .send({ name: `Manual SKU ${suffix}`, categoryIds: [categoryId], primaryCategoryId: categoryId, variants: [{ name: 'Std', sku: ` e2e-${suffix} ` }] })
      .expect(201);
    const manualProduct = manual.body as { id: string; variants: Array<{ id: string; sku: string }> };
    concurrencyProductIds.push(manualProduct.id);
    expect(manualProduct.variants[0].sku).toBe(manualSku);
    await request(server())
      .post('/api/v1/admin/products')
      .set(authorization)
      .send({ name: `Manual SKU dup ${suffix}`, categoryIds: [categoryId], primaryCategoryId: categoryId, variants: [{ name: 'Std', sku: manualSku }] })
      .expect(409);
    expect(await prisma.product.count({ where: { name: `Manual SKU dup ${suffix}` } })).toBe(0);

    // Tạo giá ở màn sửa: gửi lại cùng x-request-id → một bản giá; cùng id khác số tiền → 409.
    const priceKey = `e2e-price-${uuidv7()}`;
    const priceBody = { amount: '450000', startsAt: new Date(Date.now() + 3_600_000).toISOString() };
    const priceUrl = `/api/v1/admin/products/variants/${manualProduct.variants[0].id}/prices`;
    await request(server()).post(priceUrl).set(authorization).set('x-request-id', priceKey).send(priceBody).expect(201);
    await request(server()).post(priceUrl).set(authorization).set('x-request-id', priceKey).send(priceBody).expect(201);
    await request(server()).post(priceUrl).set(authorization).set('x-request-id', priceKey).send({ ...priceBody, amount: '999000' }).expect(409);
    expect(await prisma.productPrice.count({ where: { productVariantId: BigInt(manualProduct.variants[0].id) } })).toBe(1);
  });

  it('stores TD-02 specifications as validated JSONB and resolves labels from the attribute dictionary', async () => {
    const suffix = uuidv7().replaceAll('-', '').slice(-8).toUpperCase();
    const authorization = { authorization: `Bearer ${accessToken}` };
    const createAttribute = async (body: Record<string, unknown>) => {
      const response = await request(server()).post('/api/v1/admin/catalog/attributes').set(authorization).send(body).expect(201);
      attributeCodes.push((response.body as { code: string }).code);
      return response.body as { id: string; code: string; version: number };
    };
    const height = await createAttribute({ code: `E2E_HEIGHT_${suffix}`, name: 'Chiều cao điều chỉnh', dataType: 'NUMBER', unit: 'm' });
    const color = await createAttribute({
      code: `E2E_COLOR_${suffix}`, name: 'Màu sắc', dataType: 'OPTION', options: [{ code: 'WHITE', label: 'Trắng' }, { code: 'GRAY', label: 'Xám' }],
    });
    await request(server()).post('/api/v1/admin/catalog/attributes').set(authorization)
      .send({ code: height.code, name: 'Trùng', dataType: 'TEXT' }).expect(409);

    const categoryId = idempotencyCategoryId || ((await request(server())
      .post('/api/v1/admin/catalog/categories')
      .set(authorization)
      .send({ code: `SPEC-${suffix}`, name: 'Spec category', slug: `spec-${suffix.toLowerCase()}` })
      .expect(201)).body as { id: string }).id;
    if (!idempotencyCategoryId) idempotencyCategoryId = categoryId;
    const product = (await request(server()).post('/api/v1/admin/products').set(authorization)
      .send({ name: `Spec product ${suffix}`, categoryIds: [categoryId], primaryCategoryId: categoryId, variants: [{ name: 'Std' }] })
      .expect(201)).body as { id: string; slug: string; version: number };
    concurrencyProductIds.push(product.id);

    // Sai kiểu (số dạng chữ) → 422 và không ghi gì.
    await request(server()).put(`/api/v1/admin/products/${product.id}/specifications`).set(authorization)
      .send({ expectedVersion: product.version, specifications: [{ code: height.code, values: ['2.25m'] }] })
      .expect(422);
    const saved = await request(server()).put(`/api/v1/admin/products/${product.id}/specifications`).set(authorization)
      .send({ expectedVersion: product.version, specifications: [{ code: height.code, values: [1.55, 2.25] }, { code: color.code, values: ['white'] }] })
      .expect(200);
    const detail = saved.body as { version: number; specifications: Array<{ code: string; unit: string | null; values: Array<{ label: string }> }> };
    expect(detail.version).toBe(product.version + 1);
    expect(detail.specifications.find(({ code }) => code === height.code)?.values.map(({ label }) => label)).toEqual(['1,55 m', '2,25 m']);
    expect(detail.specifications.find(({ code }) => code === color.code)?.values.map(({ label }) => label)).toEqual(['Trắng']);
    // JSONB chỉ chứa code + giá trị, không nhãn/đơn vị.
    const row = await prisma.product.findUniqueOrThrow({ where: { id: BigInt(product.id) }, select: { specifications: true } });
    expect(row.specifications).toEqual([{ code: height.code, values: [1.55, 2.25] }, { code: color.code, values: ['WHITE'] }]);

    // Đang có sản phẩm dùng: không đổi đơn vị, không bỏ lựa chọn đang dùng.
    await request(server()).patch(`/api/v1/admin/catalog/attributes/${height.id}`).set(authorization)
      .send({ unit: 'cm', expectedVersion: height.version }).expect(409);
    await request(server()).patch(`/api/v1/admin/catalog/attributes/${color.id}`).set(authorization)
      .send({ options: [{ code: 'GRAY', label: 'Xám' }], expectedVersion: color.version }).expect(409);
    // Bỏ lựa chọn KHÔNG ai dùng thì được.
    await request(server()).patch(`/api/v1/admin/catalog/attributes/${color.id}`).set(authorization)
      .send({ options: [{ code: 'WHITE', label: 'Trắng tinh' }], expectedVersion: color.version }).expect(200);
    const relabeled = await request(server()).get(`/api/v1/admin/products/${product.slug}`).set(authorization).expect(200);
    expect((relabeled.body as typeof detail).specifications.find(({ code }) => code === color.code)?.values[0].label).toBe('Trắng tinh');
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
