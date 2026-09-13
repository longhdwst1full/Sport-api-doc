import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ObjectStorageClient } from '../../../integrations/object-storage/object-storage.client';
import { AuditWriter } from '../../audit/audit.writer';
import type { AuthPrincipal } from '../../auth/auth.types';
import { CartService } from '../../cart/cart.service';
import { ScopeType } from '../../iam/iam.types';
import { BankTransferPaymentProvider } from '../providers/bank-transfer.provider';
import { CodPaymentProvider } from '../providers/cod.provider';
import { PaymentProviderRegistry } from './payment-provider.registry';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const findFirst = jest.fn();
  const createSignedImageUpload = jest.fn();
  const prisma = {
    isEnabled: jest.fn().mockReturnValue(true),
    payment: { findMany, count, findFirst },
  } as unknown as PrismaService;
  const storage = { createSignedImageUpload } as unknown as ObjectStorageClient;
  const providers = new PaymentProviderRegistry(
    new CodPaymentProvider(),
    new BankTransferPaymentProvider(),
  );
  const service = new PaymentService(
    prisma,
    {} as CartService,
    storage,
    providers,
    { get: jest.fn((key: string) => key === 'cloudinary.folder' ? 'sport-sys/sport' : undefined) } as unknown as ConfigService,
    {} as AuditWriter,
  );
  const principal = (scopes: AuthPrincipal['scopes']): AuthPrincipal => ({
    userId: '9',
    sessionId: '10',
    displayName: 'Quản lý',
    permissionVersion: '1',
    permissions: ['payment.view', 'payment.confirm'],
    scopes,
    mustChangePassword: false,
  });

  beforeEach(() => jest.clearAllMocks());

  it('applies branch scope, filters and server pagination to the Admin queue', async () => {
    await service.listAdmin(
      { page: 2, limit: 10, status: 'AWAITING_CONFIRMATION', method: 'BANK_TRANSFER', search: 'DH-01' },
      principal([{ type: ScopeType.BRANCH, branchId: '12' }]),
    );

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: {
        AND: [
          { order: { branchId: { in: [12n] } } },
          { status: 'AWAITING_CONFIRMATION' },
          { method: 'BANK_TRANSFER' },
          expect.objectContaining({ OR: expect.any(Array) as Prisma.PaymentWhereInput[] }),
        ],
      },
    }));
  });

  it('denies Admin listing without GLOBAL or BRANCH scope', async () => {
    await expect(service.listAdmin(
      { page: 1, limit: 20 },
      principal([]),
    )).rejects.toThrow('Tài khoản chưa được gán phạm vi chi nhánh');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does not issue evidence upload signatures for COD payments', async () => {
    findFirst.mockResolvedValue({
      id: 1n,
      paymentRef: 'PAY-DH-01',
      method: 'COD',
      status: 'PENDING',
      order: { checkoutSession: { cartId: 2n, cart: { userId: 9n } } },
      evidences: [],
    });

    await expect(service.createAccountUpload('9', 'DH-01', {
      fileName: 'proof.webp',
      contentType: 'image/webp',
      sizeBytes: 1024,
    })).rejects.toThrow('Đơn COD không sử dụng bằng chứng chuyển khoản');
    expect(createSignedImageUpload).not.toHaveBeenCalled();
  });
});

