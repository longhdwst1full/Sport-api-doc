import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { GhnRateProvider } from './providers/ghn-rate.provider';
import { GhtkRateProvider } from './providers/ghtk-rate.provider';
import { ShippingQuoteService } from './shipping-quote.service';

describe('ShippingQuoteService', () => {
  const findBranch = jest.fn();
  const findRates = jest.fn();
  const prisma = {
    branch: { findFirst: findBranch },
    shippingRate: { findMany: findRates },
  } as unknown as PrismaService;
  const config = { getOrThrow: jest.fn().mockReturnValue(10) } as unknown as ConfigService;
  const disabledProvider = { isEnabled: () => false, canQuote: () => false };
  const service = new ShippingQuoteService(
    prisma,
    config,
    disabledProvider as unknown as GhnRateProvider,
    disabledProvider as unknown as GhtkRateProvider,
  );

  beforeEach(() => jest.clearAllMocks());

  it('selects an eligible rate and applies its free-shipping threshold', async () => {
    findBranch.mockResolvedValue({ id: 2n });
    findRates.mockResolvedValue([{
      id: 6n,
      branchId: null,
      minWeightGrams: 0,
      maxWeightGrams: null,
      minSubtotal: new Prisma.Decimal(0),
      maxSubtotal: null,
      baseFee: new Prisma.Decimal(10_000),
      perKgFee: new Prisma.Decimal(0),
      freeShippingThreshold: null,
      etaMinDays: 4,
      etaMaxDays: 6,
      zone: { code: 'GLOBAL' },
    }, {
      id: 7n,
      branchId: 2n,
      minWeightGrams: 0,
      maxWeightGrams: null,
      minSubtotal: new Prisma.Decimal(0),
      maxSubtotal: null,
      baseFee: new Prisma.Decimal(45_000),
      perKgFee: new Prisma.Decimal(5_000),
      freeShippingThreshold: new Prisma.Decimal(1_000_000),
      etaMinDays: 1,
      etaMaxDays: 3,
      zone: { code: 'HCM' },
    }]);

    await expect(service.quote({
      branchId: '2',
      provinceCode: '79',
      subtotal: '1200000.00',
      weightGrams: 1500,
    })).resolves.toEqual({
      shippingRateId: '7',
      branchId: '2',
      zoneCode: 'HCM',
      currencyCode: 'VND',
      fee: '0.00',
      etaMinDays: 1,
      etaMaxDays: 3,
    });
  });

  it('returns free branch delivery inside the configured radius without calling a carrier', async () => {
    await expect(service.quoteCandidate({
      branchId: '2',
      provinceCode: '79',
      subtotal: '1200000.00',
      distanceKm: 9.8,
      pickup: { addressLine: 'A', district: '1', province: 'HCM' },
      recipient: { addressLine: 'B', district: '1', province: 'HCM' },
      package: { weightGrams: 1000, declaredValue: 1200000, codAmount: 0 },
    })).resolves.toMatchObject({
      method: 'BRANCH_FREE',
      fee: '0.00',
      requiresConsultation: false,
    });
  });

  it.each([
    [4_000, '50000.00'],
    [10_000, '100000.00'],
    [30_000, '200000.00'],
  ])('uses the configured internal default fee for %i grams', async (weightGrams, fee) => {
    findBranch.mockResolvedValue({ id: 2n });
    findRates.mockResolvedValue([]);
    const tierConfig = {
      getOrThrow: jest.fn().mockImplementation((key: string) => key === 'app.shipping.freeRadiusKm'
        ? 10
        : {
            smallMaxWeightGrams: 5_000,
            mediumMaxWeightGrams: 20_000,
            smallFeeVnd: 50_000,
            mediumFeeVnd: 100_000,
            largeFeeVnd: 200_000,
          }),
    } as unknown as ConfigService;
    const tierService = new ShippingQuoteService(
      prisma,
      tierConfig,
      disabledProvider as unknown as GhnRateProvider,
      disabledProvider as unknown as GhtkRateProvider,
    );

    await expect(tierService.quoteCandidate({
      branchId: '2',
      provinceCode: '79',
      subtotal: '1200000.00',
      distanceKm: 15,
      pickup: { addressLine: 'A', district: '1', province: 'HCM' },
      recipient: { addressLine: 'B', district: '3', province: 'HCM' },
      package: { weightGrams, declaredValue: 1200000, codAmount: 0 },
    })).resolves.toMatchObject({
      method: 'STANDARD_DELIVERY',
      provider: 'INTERNAL',
      fee,
      requiresConsultation: false,
    });
  });
});
