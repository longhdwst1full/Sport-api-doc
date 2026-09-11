import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import { PrismaService } from '../../database/prisma.service';
import { PRODUCT_STATUS, PRODUCT_TYPE, PRODUCT_VARIANT_STATUS } from '../catalog/products/product.constants';
import { USER_STATUS, USER_TYPE } from '../iam/iam.constants';
import { CART_CURRENCY, CART_STATUS } from './cart.constants';
import { CartDto, GuestCartDto } from './cart.dto';

type CartWithItems = Prisma.CartGetPayload<{ include: ReturnType<CartService['cartInclude']> }>;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createGuest(): Promise<GuestCartDto> {
    this.ensurePersistence();
    const rawToken = randomBytes(32).toString('base64url');
    const ttlDays = this.config.getOrThrow<number>('app.cart.guestTtlDays');
    const cart = await this.prisma.cart.create({
      data: {
        anonymousTokenHash: this.hashToken(rawToken),
        currencyCode: CART_CURRENCY,
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
      include: this.cartInclude(),
    });
    return { ...this.toDto(cart), cartToken: rawToken };
  }

  async getGuest(rawToken: string): Promise<CartDto> {
    return this.toDto(await this.findGuest(rawToken));
  }

  async getOrCreateAccount(userId: string): Promise<CartDto> {
    this.ensurePersistence();
    const databaseUserId = toDatabaseId(userId);
    const user = await this.prisma.user.findFirst({
      where: { id: databaseUserId, userType: USER_TYPE.CUSTOMER, status: USER_STATUS.ACTIVE },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Active customer account was not found');
    const existing = await this.prisma.cart.findFirst({
      where: { userId: databaseUserId, status: CART_STATUS.ACTIVE },
      include: this.cartInclude(),
    });
    if (existing) return this.toDto(existing);
    try {
      return this.toDto(
        await this.prisma.cart.create({
          data: { userId: databaseUserId, currencyCode: CART_CURRENCY },
          include: this.cartInclude(),
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.cart.findFirstOrThrow({
          where: { userId: databaseUserId, status: CART_STATUS.ACTIVE },
          include: this.cartInclude(),
        });
        return this.toDto(raced);
      }
      throw error;
    }
  }

  async setGuestItem(
    rawToken: string,
    variantId: string,
    quantity: number,
    expectedVersion: number,
  ): Promise<CartDto> {
    const cart = await this.findGuest(rawToken);
    return this.setItem(cart.id, variantId, quantity, expectedVersion);
  }

  async setAccountItem(
    userId: string,
    variantId: string,
    quantity: number,
    expectedVersion: number,
  ): Promise<CartDto> {
    const cart = await this.getOrCreateAccountRow(userId);
    return this.setItem(cart.id, variantId, quantity, expectedVersion);
  }

  async updateGuestItem(
    rawToken: string,
    itemId: string,
    quantity: number,
    expectedVersion: number,
  ): Promise<CartDto> {
    const cart = await this.findGuest(rawToken);
    return this.updateItem(cart.id, itemId, quantity, expectedVersion);
  }

  async updateAccountItem(
    userId: string,
    itemId: string,
    quantity: number,
    expectedVersion: number,
  ): Promise<CartDto> {
    const cart = await this.getOrCreateAccountRow(userId);
    return this.updateItem(cart.id, itemId, quantity, expectedVersion);
  }

  async removeGuestItem(
    rawToken: string,
    itemId: string,
    expectedVersion: number,
  ): Promise<CartDto> {
    const cart = await this.findGuest(rawToken);
    return this.removeItem(cart.id, itemId, expectedVersion);
  }

  async removeAccountItem(
    userId: string,
    itemId: string,
    expectedVersion: number,
  ): Promise<CartDto> {
    const cart = await this.getOrCreateAccountRow(userId);
    return this.removeItem(cart.id, itemId, expectedVersion);
  }

  async resolveGuestCartId(rawToken: string): Promise<bigint> {
    return (await this.findGuest(rawToken)).id;
  }

  /**
   * Order retry vẫn phải xác thực bằng đúng guest token sau khi cart đã chuyển CONVERTED.
   * Không dùng `findGuest` vì method đó cố ý chỉ phục vụ giỏ ACTIVE.
   */
  async resolveGuestCartIdForOrder(rawToken: string): Promise<bigint> {
    this.ensurePersistence();
    const token = rawToken.trim();
    if (!token) throw new NotFoundException('Không tìm thấy giỏ hàng của khách');
    const cart = await this.prisma.cart.findFirst({
      where: {
        anonymousTokenHash: this.hashToken(token),
        status: { in: [CART_STATUS.ACTIVE, CART_STATUS.CONVERTED] },
      },
      select: { id: true },
    });
    if (!cart) throw new NotFoundException('Không tìm thấy giỏ hàng của khách');
    return cart.id;
  }

  async resolveAccountCartId(userId: string): Promise<bigint> {
    return (await this.getOrCreateAccountRow(userId)).id;
  }

  private async setItem(
    cartId: bigint,
    variantId: string,
    quantity: number,
    expectedVersion: number,
  ): Promise<CartDto> {
    const databaseVariantId = toDatabaseId(variantId);
    return this.prisma.$transaction(async (transaction) => {
      await this.bumpCartVersion(transaction, cartId, expectedVersion);
      const variant = await this.findSellableVariant(transaction, databaseVariantId);
      const price = variant.prices[0];
      await transaction.cartItem.upsert({
        where: { cartId_productVariantId: { cartId, productVariantId: databaseVariantId } },
        create: {
          cartId,
          productVariantId: databaseVariantId,
          quantity,
          priceSeenAt: new Date(),
          unitPricePreview: price.amount,
        },
        update: {
          quantity,
          priceSeenAt: new Date(),
          unitPricePreview: price.amount,
          version: { increment: 1 },
        },
      });
      return this.toDto(await this.findById(transaction, cartId));
    });
  }

  private async updateItem(
    cartId: bigint,
    itemId: string,
    quantity: number,
    expectedVersion: number,
  ): Promise<CartDto> {
    return this.prisma.$transaction(async (transaction) => {
      await this.bumpCartVersion(transaction, cartId, expectedVersion);
      const updated = await transaction.cartItem.updateMany({
        where: { id: toDatabaseId(itemId), cartId },
        data: { quantity, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new NotFoundException('Cart item was not found');
      return this.toDto(await this.findById(transaction, cartId));
    });
  }

  private async removeItem(
    cartId: bigint,
    itemId: string,
    expectedVersion: number,
  ): Promise<CartDto> {
    return this.prisma.$transaction(async (transaction) => {
      await this.bumpCartVersion(transaction, cartId, expectedVersion);
      const deleted = await transaction.cartItem.deleteMany({
        where: { id: toDatabaseId(itemId), cartId },
      });
      if (deleted.count !== 1) throw new NotFoundException('Cart item was not found');
      return this.toDto(await this.findById(transaction, cartId));
    });
  }

  private async bumpCartVersion(
    transaction: Prisma.TransactionClient,
    cartId: bigint,
    expectedVersion: number,
  ): Promise<void> {
    const updated = await transaction.cart.updateMany({
      where: { id: cartId, status: CART_STATUS.ACTIVE, version: BigInt(expectedVersion) },
      data: { version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictException('Cart changed; reload and retry');
    }
  }

  private async findSellableVariant(transaction: Prisma.TransactionClient, id: bigint) {
    const now = new Date();
    const variant = await transaction.productVariant.findFirst({
      where: {
        id,
        status: PRODUCT_VARIANT_STATUS.ACTIVE,
        product: { status: PRODUCT_STATUS.PUBLISHED },
      },
      include: {
        product: true,
        prices: {
          where: {
            status: 'ACTIVE',
            priceType: 'REGULAR',
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          orderBy: { startsAt: 'desc' },
          take: 1,
        },
        bundleDefinition: {
          include: {
            items: {
              include: { componentVariant: { include: { product: true } } },
            },
          },
        },
      },
    });
    if (!variant || variant.prices.length !== 1) {
      throw new UnprocessableEntityException('Product variant is not sellable');
    }
    const validStandard =
      variant.product.productType === PRODUCT_TYPE.STANDARD && !variant.bundleDefinition;
    const validBundle =
      variant.product.productType === PRODUCT_TYPE.BUNDLE &&
      variant.bundleDefinition?.status === 'ACTIVE' &&
      variant.bundleDefinition.items.length > 0 &&
      variant.bundleDefinition.items.every(
        ({ componentVariant }) =>
          componentVariant.status === PRODUCT_VARIANT_STATUS.ACTIVE &&
          componentVariant.product.status !== PRODUCT_STATUS.ARCHIVED,
      );
    if (!validStandard && !validBundle) {
      throw new UnprocessableEntityException('Product variant is not sellable');
    }
    return variant;
  }

  private async findGuest(rawToken: string): Promise<CartWithItems> {
    this.ensurePersistence();
    const token = rawToken.trim();
    if (!token) throw new NotFoundException('Active guest cart was not found');
    const cart = await this.prisma.cart.findFirst({
      where: {
        anonymousTokenHash: this.hashToken(token),
        status: CART_STATUS.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: this.cartInclude(),
    });
    if (!cart) throw new NotFoundException('Active guest cart was not found');
    return cart;
  }

  private async getOrCreateAccountRow(userId: string): Promise<CartWithItems> {
    await this.getOrCreateAccount(userId);
    return this.prisma.cart.findFirstOrThrow({
      where: { userId: toDatabaseId(userId), status: CART_STATUS.ACTIVE },
      include: this.cartInclude(),
    });
  }

  private findById(transaction: Prisma.TransactionClient, id: bigint): Promise<CartWithItems> {
    return transaction.cart.findUniqueOrThrow({ where: { id }, include: this.cartInclude() });
  }

  private cartInclude() {
    const now = new Date();
    return {
      items: {
        include: {
          productVariant: {
            include: {
              product: {
                include: {
                  media: {
                    where: { status: 'ACTIVE' },
                    include: { mediaAsset: true },
                    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
                    take: 1,
                  },
                },
              },
              prices: {
                where: {
                  status: 'ACTIVE',
                  priceType: 'REGULAR',
                  startsAt: { lte: now },
                  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                },
                orderBy: { startsAt: 'desc' as const },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    } satisfies Prisma.CartInclude;
  }

  private toDto(cart: CartWithItems): CartDto {
    const items = cart.items.map((item) => {
      const currentPrice = item.productVariant.prices[0]?.amount ?? item.unitPricePreview;
      const imageUrl = item.productVariant.product.media[0]?.mediaAsset.secureUrl ?? null;
      return {
        id: toEntityId(item.id),
        productVariantId: toEntityId(item.productVariantId),
        sku: item.productVariant.sku,
        name: item.productVariant.name,
        productName: item.productVariant.product.name,
        productSlug: item.productVariant.product.slug,
        quantity: item.quantity,
        unitPricePreview: currentPrice?.toFixed(2) ?? null,
        lineTotalPreview: currentPrice?.mul(item.quantity).toFixed(2) ?? null,
        imageUrl,
      };
    });
    const subtotal = items.reduce(
      (total, item) => total.add(item.lineTotalPreview ?? 0),
      new Prisma.Decimal(0),
    );
    return {
      id: toEntityId(cart.id),
      status: cart.status,
      currencyCode: cart.currencyCode,
      version: Number(cart.version),
      items,
      subtotalPreview: subtotal.toFixed(2),
      expiresAt: cart.expiresAt?.toISOString() ?? null,
    };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Durable cart storage is not enabled');
    }
  }
}
