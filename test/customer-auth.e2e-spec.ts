import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { createApplication } from '../src/platform/app.factory';

describe('Storefront customer authentication', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const suffix = uuidv7().replaceAll('-', '');
  const email = `customer-${suffix}@example.invalid`;
  const phoneDigits = suffix.replace(/\D/g, '').padEnd(7, '0').slice(-7);
  const phoneInput = `090${phoneDigits}`;
  const normalizedPhone = `+8490${phoneDigits}`;
  const password = 'Customer-password-123!';
  let customerId: bigint | undefined;

  beforeAll(async () => {
    app = await createApplication({ logger: false, swagger: false });
  });

  afterAll(async () => {
    if (customerId !== undefined) {
      await prisma.authSession.deleteMany({ where: { userId: customerId } });
      await prisma.user.deleteMany({ where: { id: customerId } });
    }
    if (app) await app.close();
    await prisma.$disconnect();
  });

  const server = (): Parameters<typeof request>[0] =>
    app.getHttpServer() as Parameters<typeof request>[0];

  it('registers ACTIVE CUSTOMER and logs in with either normalized email or phone', async () => {
    const registration = await request(server())
      .post('/api/v1/auth/register')
      .send({
        displayName: 'E2E Customer',
        email: email.toUpperCase(),
        phone: phoneInput,
        password,
      })
      .expect(201);
    expect(registration.body).toEqual(expect.objectContaining({ tokenType: 'Bearer' }));

    const customer = await prisma.user.findFirstOrThrow({ where: { normalizedEmail: email } });
    customerId = customer.id;
    expect(customer).toMatchObject({
      userType: 'CUSTOMER',
      normalizedPhone,
      status: 'ACTIVE',
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
    });

    await request(server())
      .post('/api/v1/auth/login')
      .send({ identifier: email.toUpperCase(), password })
      .expect(200);
    await request(server())
      .post('/api/v1/auth/login')
      .send({ identifier: normalizedPhone, password })
      .expect(200);
    await request(server())
      .post('/api/v1/admin/auth/login')
      .send({ identifier: email, password })
      .expect(401);
  });

  it('returns canonical errors for duplicate identity and invalid phone', async () => {
    const duplicate = await request(server())
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Duplicate Customer',
        phone: normalizedPhone.replace('+', ''),
        password,
      })
      .expect(409);
    expect(duplicate.body).toEqual(expect.objectContaining({ code: 'CONFLICT' }));

    const invalid = await request(server())
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Invalid Customer',
        phone: '+1 202 555 0123',
        password,
      })
      .expect(400);
    expect(invalid.body).toEqual(expect.objectContaining({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ field: 'phone', code: 'INVALID_PHONE' })],
    }));
  });
});
