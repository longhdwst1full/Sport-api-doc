import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { ObjectStorageClient } from '../src/integrations/object-storage/object-storage.client';
import { AuditWriter } from '../src/modules/audit/audit.writer';
import type { AuthPrincipal } from '../src/modules/auth/auth.types';
import { CartService } from '../src/modules/cart/cart.service';
import { ScopeType } from '../src/modules/iam/iam.types';
import { BankTransferPaymentProvider } from '../src/modules/payment/providers/bank-transfer.provider';
import { CodPaymentProvider } from '../src/modules/payment/providers/cod.provider';
import { PaymentProviderRegistry } from '../src/modules/payment/services/payment-provider.registry';
import { PaymentService } from '../src/modules/payment/services/payment.service';

describe('Payment review persistence and idempotency', () => {
  const cleanup = new PrismaClient();
  const marker = `payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'database.url') return process.env.DATABASE_URL;
      if (key === 'database.enabled') return true;
      return undefined;
    }),
  } as unknown as ConfigService;
  const prisma = new PrismaService(config);
  const audit = { write: jest.fn().mockResolvedValue({ id: '1', createdAt: new Date().toISOString() }) } as unknown as AuditWriter;
  const service = new PaymentService(
    prisma,
    {} as CartService,
    {} as ObjectStorageClient,
    new PaymentProviderRegistry(new CodPaymentProvider(), new BankTransferPaymentProvider()),
    config,
    audit,
  );
  let branchId = 0n;
  let warehouseId = 0n;
  let customerId = 0n;
  let adminId = 0n;
  const createdOrderIds: bigint[] = [];
  const createdCheckoutIds: bigint[] = [];
  const createdReservationIds: bigint[] = [];
  const createdCartIds: bigint[] = [];

  const principal = (): AuthPrincipal => ({
    userId: adminId.toString(),
    sessionId: '1',
    displayName: 'Payment integration owner',
    permissionVersion: '1',
    permissions: ['payment.view', 'payment.confirm'],
    scopes: [{ type: ScopeType.GLOBAL }],
    mustChangePassword: false,
  });
  const context = (requestId: string) => ({ requestId, actorUserId: adminId.toString() });

  async function createBankPayment(sequence: number, expectedAmount = '1000000') {
    const cart = await cleanup.cart.create({
      data: {
        anonymousTokenHash: createHash('sha256').update(`${marker}-cart-${sequence}`).digest('hex'),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    createdCartIds.push(cart.id);
    const checkout = await cleanup.checkoutSession.create({
      data: {
        checkoutToken: `${marker}-checkout-${sequence}`,
        cartId: cart.id,
        customerId,
        branchId,
        warehouseId,
        status: 'COMPLETED',
        paymentMethod: 'BANK_TRANSFER',
        shippingMethod: 'MANUAL_EXTERNAL',
        itemSubtotal: expectedAmount,
        shippingTotal: '0',
        grandTotal: expectedAmount,
        etaMinDays: 1,
        etaMaxDays: 2,
        recipientSnapshot: { recipient: 'Khách kiểm thử' },
        shippingRuleSnapshot: { source: 'INTEGRATION_TEST' },
        idempotencyKey: `${marker}-checkout-idem-${sequence}`,
        requestHash: marker.padEnd(64, String(sequence)).slice(0, 64),
        expiresAt: new Date(Date.now() + 30 * 60_000),
        confirmedAt: new Date(),
      },
    });
    createdCheckoutIds.push(checkout.id);
    const reservation = await cleanup.inventoryReservation.create({
      data: {
        checkoutSessionId: checkout.id,
        warehouseId,
        reservationToken: `${marker}-reservation-${sequence}`,
        idempotencyKey: `${marker}-reservation-idem-${sequence}`,
        requestHash: marker.padEnd(64, String(sequence + 3)).slice(0, 64),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    createdReservationIds.push(reservation.id);
    const order = await cleanup.order.create({
      data: {
        orderNo: `PAY${Date.now().toString().slice(-8)}${sequence}`,
        idempotencyKey: `${marker}-order-idem-${sequence}`,
        requestHash: marker.padEnd(64, String(sequence + 6)).slice(0, 64),
        checkoutSessionId: checkout.id,
        reservationId: reservation.id,
        customerId,
        branchId,
        warehouseId,
        status: 'PENDING_CONFIRMATION',
        paymentStatus: 'AWAITING_CONFIRMATION',
        subtotal: expectedAmount,
        grandTotal: expectedAmount,
        addresses: {
          create: {
            recipientName: 'Khách kiểm thử Payment',
            recipientPhone: '+84901234567',
            addressLine: '1 Nguyễn Trãi',
            provinceCode: '79',
            provinceName: 'TP. Hồ Chí Minh',
          },
        },
        payment: {
          create: {
            paymentRef: `${marker}-ref-${sequence}`.toUpperCase(),
            method: 'BANK_TRANSFER',
            status: 'AWAITING_CONFIRMATION',
            expectedAmount,
            receivedAmount: '0',
            expiresAt: new Date(Date.now() + 30 * 60_000),
          },
        },
      },
      include: { payment: true },
    });
    createdOrderIds.push(order.id);
    return order.payment!;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const branch = await cleanup.branch.create({
      data: { code: marker.toUpperCase().slice(0, 32), name: 'Payment integration branch', addressJson: {} },
    });
    branchId = branch.id;
    warehouseId = (await cleanup.warehouse.create({
      data: { branchId, code: `${marker}-wh`.toUpperCase().slice(0, 32), name: 'Payment integration warehouse' },
    })).id;
    const customerPhone = `+849${Date.now().toString().slice(-8)}`;
    customerId = (await cleanup.customer.create({
      data: {
        customerNo: `${marker}-cus`.toUpperCase().slice(0, 32),
        name: 'Payment integration customer',
        phone: customerPhone,
        normalizedPhone: customerPhone,
      },
    })).id;
    adminId = (await cleanup.user.create({
      data: {
        userType: 'STAFF',
        email: `${marker}@example.invalid`,
        normalizedEmail: `${marker}@example.invalid`,
        displayName: 'Payment integration owner',
        status: 'ACTIVE',
      },
    })).id;
  });

  afterAll(async () => {
    // TEST-CLEANUP: production ledger is append-only; only this isolated fixture
    // temporarily disables its mutation trigger to remove test rows.
    await cleanup.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('ALTER TABLE public.payment_transactions DISABLE TRIGGER payment_transactions_no_update_or_delete');
      await transaction.paymentTransaction.deleteMany({ where: { payment: { orderId: { in: createdOrderIds } } } });
      await transaction.$executeRawUnsafe('ALTER TABLE public.payment_transactions ENABLE TRIGGER payment_transactions_no_update_or_delete');
    });
    await cleanup.paymentEvidence.deleteMany({ where: { payment: { orderId: { in: createdOrderIds } } } });
    await cleanup.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await cleanup.orderAddress.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await cleanup.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await cleanup.inventoryReservation.deleteMany({ where: { id: { in: createdReservationIds } } });
    await cleanup.checkoutSession.deleteMany({ where: { id: { in: createdCheckoutIds } } });
    await cleanup.cart.deleteMany({ where: { id: { in: createdCartIds } } });
    if (adminId) await cleanup.user.delete({ where: { id: adminId } });
    if (customerId) await cleanup.customer.delete({ where: { id: customerId } });
    if (warehouseId) await cleanup.warehouse.delete({ where: { id: warehouseId } });
    if (branchId) await cleanup.branch.delete({ where: { id: branchId } });
    await prisma.$disconnect();
    await cleanup.$disconnect();
  });

  it('confirms an exact bank transfer once and safely replays the same command', async () => {
    const payment = await createBankPayment(1);
    const command = { expectedVersion: '0', receivedAmount: '1000000.00', reference: `${marker}-bank-1` };
    const first = await service.confirmAdmin(payment.id.toString(), command, `${marker}-confirm-1`, principal(), context(`${marker}-request-1`));
    const replay = await service.confirmAdmin(payment.id.toString(), command, `${marker}-confirm-1`, principal(), context(`${marker}-request-2`));

    expect(first).toMatchObject({ status: 'SUCCESS', receivedAmount: '1000000.00', orderStatus: 'PENDING_CONFIRMATION', version: '1' });
    expect(replay).toMatchObject({ id: first.id, status: 'SUCCESS', version: '1' });
    await expect(cleanup.paymentTransaction.count({ where: { paymentId: payment.id } })).resolves.toBe(1);
    await expect(cleanup.order.findFirstOrThrow({ where: { payment: { id: payment.id } } })).resolves.toMatchObject({ paymentStatus: 'SUCCESS' });
  });

  it('moves a mismatched amount to review and accepts the corrected exact amount with a new version', async () => {
    const payment = await createBankPayment(2);
    const reviewed = await service.confirmAdmin(
      payment.id.toString(),
      { expectedVersion: '0', receivedAmount: '900000.00', reference: `${marker}-bank-2a` },
      `${marker}-confirm-2a`,
      principal(),
      context(`${marker}-request-2a`),
    );
    expect(reviewed).toMatchObject({ status: 'NEED_REVIEW', receivedAmount: '900000.00', version: '1' });

    const corrected = await service.confirmAdmin(
      payment.id.toString(),
      { expectedVersion: '1', receivedAmount: '1000000.00', reference: `${marker}-bank-2b` },
      `${marker}-confirm-2b`,
      principal(),
      context(`${marker}-request-2b`),
    );
    expect(corrected).toMatchObject({ status: 'SUCCESS', receivedAmount: '1000000.00', version: '2' });
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const payment = await createBankPayment(3);
    await service.confirmAdmin(
      payment.id.toString(),
      { expectedVersion: '0', receivedAmount: '1000000.00', reference: `${marker}-bank-3` },
      `${marker}-confirm-3`,
      principal(),
      context(`${marker}-request-3a`),
    );
    await expect(service.confirmAdmin(
      payment.id.toString(),
      { expectedVersion: '1', receivedAmount: '1000000.00', reference: `${marker}-bank-changed` },
      `${marker}-confirm-3`,
      principal(),
      context(`${marker}-request-3b`),
    )).rejects.toThrow('Idempotency-Key đã được dùng cho yêu cầu thanh toán khác');
  });
});
