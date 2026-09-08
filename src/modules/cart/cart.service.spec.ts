import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../database/prisma.service';
import { CartService } from './cart.service';

describe('CartService', () => {
  const create = jest.fn();
  const findFirst = jest.fn();
  const prisma = {
    isEnabled: () => true,
    cart: { create, findFirst },
  } as unknown as PrismaService;
  const config = {
    getOrThrow: jest.fn().mockReturnValue(30),
  } as unknown as ConfigService;
  const service = new CartService(prisma, config);

  beforeEach(() => {
    create.mockReset();
    findFirst.mockReset();
  });

  it('returns a raw guest token but persists only its SHA-256 hash', async () => {
    let persisted: { anonymousTokenHash: string; expiresAt: Date } | undefined;
    create.mockImplementation(
      ({ data }: { data: { anonymousTokenHash: string; expiresAt: Date } }) => {
        persisted = data;
        return Promise.resolve({
        id: 1n,
        status: 'ACTIVE',
        currencyCode: 'VND',
        version: 0n,
        expiresAt: data.expiresAt,
        items: [],
        });
      },
    );

    const result = await service.createGuest();

    expect(result.cartToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(persisted?.anonymousTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(persisted?.anonymousTokenHash).not.toBe(result.cartToken);
    expect(result.subtotalPreview).toBe('0.00');
  });

  it('does not query the database when the guest token is missing', async () => {
    await expect(service.getGuest('   ')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
