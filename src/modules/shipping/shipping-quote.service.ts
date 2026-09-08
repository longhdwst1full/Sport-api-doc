import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { SHIPPING_CURRENCY, SHIPPING_METHOD, SHIPPING_RULE_STATUS } from './shipping.constants';
import { ShippingQuoteDto, ShippingQuoteRequestDto } from './shipping-quote.dto';
import { GhnRateProvider } from './providers/ghn-rate.provider';
import { GhtkRateProvider } from './providers/ghtk-rate.provider';
import { ShippingRateQuoteInput } from './providers/shipping-rate.provider';

export interface DeliveryQuoteCandidateInput extends ShippingRateQuoteInput {
  branchId: string;
  provinceCode: string;
  subtotal: string;
  distanceKm: number | null;
}

export interface DeliveryQuoteOption {
  method: (typeof SHIPPING_METHOD)[keyof typeof SHIPPING_METHOD];
  provider: 'GHN' | 'GHTK' | 'INTERNAL' | null;
  fee: string | null;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  distanceKm: number | null;
  requiresConsultation: boolean;
  providerQuoteRef?: string;
}

@Injectable()
export class ShippingQuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ghn: GhnRateProvider,
    private readonly ghtk: GhtkRateProvider,
  ) {}

  async quoteCandidate(input: DeliveryQuoteCandidateInput): Promise<DeliveryQuoteOption> {
    const freeRadiusKm = this.config.getOrThrow<number>('app.shipping.freeRadiusKm');
    if (input.distanceKm !== null && input.distanceKm <= freeRadiusKm) {
      return {
        method: SHIPPING_METHOD.BRANCH_FREE,
        provider: 'INTERNAL',
        fee: '0.00',
        etaMinDays: 0,
        etaMaxDays: 1,
        distanceKm: input.distanceKm,
        requiresConsultation: false,
      };
    }

    const enabledProviders = [this.ghn, this.ghtk]
      .filter((provider) => provider.isEnabled() && provider.canQuote(input));
    const settled = await Promise.allSettled(enabledProviders.map((provider) => provider.quote(input)));
    const external = settled
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<GhnRateProvider['quote']>>> => result.status === 'fulfilled')
      .map(({ value }) => value)
      .sort((left, right) => left.fee - right.fee || left.etaMaxDays - right.etaMaxDays)[0];
    if (external) {
      return {
        method: SHIPPING_METHOD.THIRD_PARTY,
        provider: external.provider,
        fee: new Prisma.Decimal(external.fee).toFixed(2),
        etaMinDays: external.etaMinDays,
        etaMaxDays: external.etaMaxDays,
        distanceKm: input.distanceKm,
        requiresConsultation: false,
        providerQuoteRef: external.reference,
      };
    }

    try {
      const fallback = await this.quote({
        branchId: input.branchId,
        provinceCode: input.provinceCode,
        subtotal: input.subtotal,
        weightGrams: input.package.weightGrams,
      });
      return {
        method: SHIPPING_METHOD.STANDARD_DELIVERY,
        provider: 'INTERNAL',
        fee: fallback.fee,
        etaMinDays: fallback.etaMinDays,
        etaMaxDays: fallback.etaMaxDays,
        distanceKm: input.distanceKm,
        requiresConsultation: false,
      };
    } catch {
      const rates = this.config.getOrThrow<{
        smallMaxWeightGrams: number;
        mediumMaxWeightGrams: number;
        smallFeeVnd: number;
        mediumFeeVnd: number;
        largeFeeVnd: number;
      }>('app.shipping.defaultRates');
      const fee = input.package.weightGrams <= rates.smallMaxWeightGrams
        ? rates.smallFeeVnd
        : input.package.weightGrams <= rates.mediumMaxWeightGrams
          ? rates.mediumFeeVnd
          : rates.largeFeeVnd;
      return {
        method: SHIPPING_METHOD.STANDARD_DELIVERY,
        provider: 'INTERNAL',
        fee: new Prisma.Decimal(fee).toFixed(2),
        etaMinDays: 2,
        etaMaxDays: 5,
        distanceKm: input.distanceKm,
        requiresConsultation: false,
      };
    }
  }

  async quote(input: ShippingQuoteRequestDto): Promise<ShippingQuoteDto> {
    const branchId = toDatabaseId(input.branchId);
    const subtotal = new Prisma.Decimal(input.subtotal);
    if (subtotal.isNegative()) throw new UnprocessableEntityException('Subtotal cannot be negative');

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, status: SHIPPING_RULE_STATUS.ACTIVE },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Active fulfillment branch was not found');

    const rates = await this.prisma.shippingRate.findMany({
      where: {
        status: SHIPPING_RULE_STATUS.ACTIVE,
        OR: [{ branchId }, { branchId: null }],
        zone: {
          status: SHIPPING_RULE_STATUS.ACTIVE,
          provinceCodes: { has: input.provinceCode.trim() },
        },
      },
      include: { zone: true },
      orderBy: [{ zone: { priority: 'desc' } }, { id: 'asc' }],
    });
    const eligible = rates.filter((candidate) =>
      input.weightGrams >= candidate.minWeightGrams &&
      (candidate.maxWeightGrams === null || input.weightGrams <= candidate.maxWeightGrams) &&
      subtotal.greaterThanOrEqualTo(candidate.minSubtotal) &&
      (candidate.maxSubtotal === null || subtotal.lessThanOrEqualTo(candidate.maxSubtotal)),
    );
    const rate = eligible.find((candidate) => candidate.branchId === branchId)
      ?? eligible.find((candidate) => candidate.branchId === null);
    if (!rate) throw new UnprocessableEntityException('No shipping rate supports this destination and cart');

    const fee = rate.freeShippingThreshold && subtotal.greaterThanOrEqualTo(rate.freeShippingThreshold)
      ? new Prisma.Decimal(0)
      : rate.baseFee.add(rate.perKgFee.mul(Math.ceil(input.weightGrams / 1000)));
    return {
      shippingRateId: toEntityId(rate.id),
      branchId: toEntityId(branchId),
      zoneCode: rate.zone.code,
      currencyCode: SHIPPING_CURRENCY,
      fee: fee.toFixed(2),
      etaMinDays: rate.etaMinDays,
      etaMaxDays: rate.etaMaxDays,
    };
  }
}
