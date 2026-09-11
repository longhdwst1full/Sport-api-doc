import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  InventoryReservationService,
  isSerializationConflict,
} from './inventory-reservation.service';

describe('InventoryReservationService demand expansion', () => {
  const service = new InventoryReservationService({} as never, {} as never, {} as never);

  it('merges standard and bundle component demand by physical SKU', () => {
    const result = service.buildPhysicalDemand([
      {
        itemType: 'STANDARD',
        productVariantId: 11n,
        quantity: 2,
        componentSnapshot: null,
      },
      {
        itemType: 'BUNDLE',
        productVariantId: 99n,
        quantity: 3,
        componentSnapshot: [
          { productVariantId: '11', quantity: 1 },
          { productVariantId: '12', quantity: 2 },
        ] as Prisma.JsonArray,
      },
    ]);

    expect(result.map(({ productVariantId, quantity }) => [productVariantId, quantity])).toEqual([
      [11n, 5],
      [12n, 6],
    ]);
  });

  it('fails closed for an invalid bundle snapshot', () => {
    expect(() =>
      service.buildPhysicalDemand([
        {
          itemType: 'BUNDLE',
          productVariantId: 99n,
          quantity: 1,
          componentSnapshot: [{ productVariantId: '0', quantity: 1 }] as Prisma.JsonArray,
        },
      ]),
    ).toThrow(ServiceUnavailableException);
  });

  it('does not allow one cart to confirm or release another cart checkout', () => {
    expect(() => service['assertCartOwnership'](11n, {
      actorType: 'GUEST',
      cartId: 12n,
    })).toThrow(NotFoundException);
  });
});

describe('InventoryReservationService serialization conflict mapping', () => {
  const knownError = (code: string, meta?: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('Concurrent transaction', {
      code,
      clientVersion: '6.19.3',
      meta,
    });

  it.each([
    ['P2034 transaction conflict', knownError('P2034')],
    ['P2010 raw SQLSTATE conflict', knownError('P2010', { code: '40001' })],
    ['direct SQLSTATE conflict', knownError('40001')],
  ])('recognizes %s', (_caseName, error) => {
    expect(isSerializationConflict(error)).toBe(true);
  });

  it('does not classify unrelated Prisma errors as serialization conflicts', () => {
    expect(isSerializationConflict(knownError('P2002'))).toBe(false);
    expect(isSerializationConflict(new Error('40001'))).toBe(false);
  });
});
