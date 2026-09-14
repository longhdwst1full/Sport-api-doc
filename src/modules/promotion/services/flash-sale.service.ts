import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toActorDatabaseId, toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { MutationContext } from '../../../common/request/request-context';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import {
  AdminFlashSaleQueryDto,
  ChangeFlashSaleCampaignStatusDto,
  CreateFlashSaleCampaignDto,
  FlashSaleCampaignDetailDto,
  FlashSaleCampaignListDto,
  FlashSaleItemDto,
  PublicFlashSaleListDto,
  RemoveFlashSaleItemDto,
  UpdateFlashSaleCampaignDto,
  UpsertFlashSaleItemDto,
} from '../dto/promotion.dto';
import {
  FLASH_SALE_CAMPAIGN_STATUS,
  FLASH_SALE_CAMPAIGN_TRANSITIONS,
  FLASH_SALE_ITEM_STATUS,
  FLASH_SALE_QUOTA_STATUS,
  FLASH_SALE_QUOTA_TTL_MINUTES,
} from '../promotion.constants';

const campaignInclude = {
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      productVariant: {
        include: {
          product: {
            include: {
              media: {
                where: { isPrimary: true, status: 'ACTIVE' },
                take: 1,
                include: { mediaAsset: { select: { thumbnailUrl: true, secureUrl: true } } },
              },
            },
          },
          prices: {
            where: { status: 'ACTIVE', priceType: 'REGULAR' },
            orderBy: { startsAt: 'desc' as const },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.FlashSaleCampaignInclude;

type LoadedCampaign = Prisma.FlashSaleCampaignGetPayload<{ include: typeof campaignInclude }>;
type LoadedItem = LoadedCampaign['items'][number];

/**
 * Một dòng hàng của checkout kèm suất flash đã snapshot lúc báo giá.
 * `flashSaleItemId = null` nghĩa là dòng đó mua theo giá thường.
 */
export interface FlashSaleQuotaLine {
  productVariantId: bigint;
  quantity: number;
  flashSaleItemId: bigint | null;
}

export interface ActiveFlashDeal {
  flashSaleItemId: bigint;
  salePrice: Prisma.Decimal;
  availableQuantity: number;
  perCustomerLimit: number | null;
}

export interface FlashSaleQuotaGrant {
  flashSaleItemId: bigint;
  productVariantId: bigint;
  quantity: number;
  salePrice: Prisma.Decimal;
}

@Injectable()
export class FlashSaleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  // ─── Storefront ────────────────────────────────────────────────────────────

  /**
   * Danh sách campaign đang chạy. Cửa sổ thời gian được lọc bằng giờ server,
   * không tin đồng hồ trình duyệt; `serverTime` trả kèm để client hiệu chỉnh
   * đồng hồ đếm ngược mà vẫn không tự quyết định campaign còn hiệu lực hay không.
   */
  async listPublicFlashSales(): Promise<PublicFlashSaleListDto> {
    this.ensurePersistence();
    const now = new Date();
    const campaigns = await this.prisma.flashSaleCampaign.findMany({
      where: {
        status: FLASH_SALE_CAMPAIGN_STATUS.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
      include: campaignInclude,
    });

    return {
      serverTime: now.toISOString(),
      items: campaigns.map((campaign) => ({
        code: campaign.code,
        name: campaign.name,
        description: campaign.description,
        startsAt: campaign.startsAt.toISOString(),
        endsAt: campaign.endsAt.toISOString(),
        items: campaign.items
          .filter((item) => item.status === FLASH_SALE_ITEM_STATUS.ACTIVE)
          .map((item) => this.toItemDto(item)),
      })),
    };
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async listCampaigns(query: AdminFlashSaleQueryDto): Promise<FlashSaleCampaignListDto> {
    this.ensurePersistence();
    const filters: Prisma.FlashSaleCampaignWhereInput[] = [];
    if (query.status) filters.push({ status: query.status });
    if (query.search) {
      filters.push({
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.FlashSaleCampaignWhereInput = filters.length ? { AND: filters } : {};
    const [rows, total] = await Promise.all([
      this.prisma.flashSaleCampaign.findMany({
        where,
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.flashSaleCampaign.count({ where }),
    ]);

    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.map((row) => ({
        id: toEntityId(row.id),
        code: row.code,
        name: row.name,
        description: row.description,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        status: row.status,
        itemCount: row._count.items,
        version: row.version.toString(),
      })),
    };
  }

  async getCampaign(id: string): Promise<FlashSaleCampaignDetailDto> {
    this.ensurePersistence();
    const campaign = await this.prisma.flashSaleCampaign.findUnique({
      where: { id: toDatabaseId(id) },
      include: campaignInclude,
    });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch flash sale');
    return this.toDetail(campaign);
  }

  async createCampaign(
    input: CreateFlashSaleCampaignDto,
    context: MutationContext,
  ): Promise<FlashSaleCampaignDetailDto> {
    this.ensurePersistence();
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('Thời điểm kết thúc phải sau thời điểm bắt đầu');
    }
    const actorId = toActorDatabaseId(context.actorUserId);

    const created = await this.prisma.$transaction(async (transaction) => {
      const campaign = await transaction.flashSaleCampaign.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description,
          startsAt,
          endsAt,
          status: FLASH_SALE_CAMPAIGN_STATUS.DRAFT,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'promotion.flash_sale.campaign.create',
          entityType: 'FLASH_SALE_CAMPAIGN',
          entityId: toEntityId(campaign.id),
          after: input as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
      return campaign;
    });

    return this.getCampaign(toEntityId(created.id));
  }

  async updateCampaign(
    id: string,
    input: UpdateFlashSaleCampaignDto,
    context: MutationContext,
  ): Promise<FlashSaleCampaignDetailDto> {
    this.ensurePersistence();
    const campaignId = toDatabaseId(id);

    await this.prisma.$transaction(async (transaction) => {
      const campaign = await this.loadForMutation(transaction, campaignId);
      this.assertVersion(campaign.version, input.expectedVersion);
      if (
        campaign.status === FLASH_SALE_CAMPAIGN_STATUS.ENDED ||
        campaign.status === FLASH_SALE_CAMPAIGN_STATUS.CANCELLED
      ) {
        throw new ConflictException('Chiến dịch đã kết thúc hoặc đã hủy, không sửa được nữa');
      }
      const startsAt = input.startsAt ? new Date(input.startsAt) : campaign.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : campaign.endsAt;
      if (endsAt <= startsAt) {
        throw new BadRequestException('Thời điểm kết thúc phải sau thời điểm bắt đầu');
      }
      await transaction.flashSaleCampaign.update({
        where: { id: campaignId },
        data: {
          name: input.name ?? campaign.name,
          description: input.description ?? campaign.description,
          startsAt,
          endsAt,
          updatedBy: toActorDatabaseId(context.actorUserId),
          version: { increment: 1 },
        },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'promotion.flash_sale.campaign.update',
          entityType: 'FLASH_SALE_CAMPAIGN',
          entityId: id,
          before: { name: campaign.name, startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString() },
          after: input as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
    });

    return this.getCampaign(id);
  }

  async changeCampaignStatus(
    id: string,
    input: ChangeFlashSaleCampaignStatusDto,
    context: MutationContext,
  ): Promise<FlashSaleCampaignDetailDto> {
    this.ensurePersistence();
    const campaignId = toDatabaseId(id);

    await this.prisma.$transaction(async (transaction) => {
      const campaign = await this.loadForMutation(transaction, campaignId);
      this.assertVersion(campaign.version, input.expectedVersion);
      const allowed = FLASH_SALE_CAMPAIGN_TRANSITIONS[campaign.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new ConflictException(
          `Không thể chuyển chiến dịch từ ${campaign.status} sang ${input.status}`,
        );
      }
      if (input.status === FLASH_SALE_CAMPAIGN_STATUS.ACTIVE) {
        const itemCount = await transaction.flashSaleItem.count({ where: { campaignId } });
        if (itemCount === 0) {
          throw new ConflictException('Chiến dịch chưa có sản phẩm nào, không thể kích hoạt');
        }
      }
      await transaction.flashSaleCampaign.update({
        where: { id: campaignId },
        data: {
          status: input.status,
          updatedBy: toActorDatabaseId(context.actorUserId),
          version: { increment: 1 },
        },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: `promotion.flash_sale.campaign.${input.status.toLowerCase()}`,
          entityType: 'FLASH_SALE_CAMPAIGN',
          entityId: id,
          before: { status: campaign.status },
          after: { status: input.status },
        },
        transaction,
      );
    });

    return this.getCampaign(id);
  }

  async upsertItem(
    campaignId: string,
    input: UpsertFlashSaleItemDto,
    context: MutationContext,
  ): Promise<FlashSaleCampaignDetailDto> {
    this.ensurePersistence();
    const id = toDatabaseId(campaignId);
    const variantId = toDatabaseId(input.productVariantId);

    await this.prisma.$transaction(async (transaction) => {
      const campaign = await this.loadForMutation(transaction, id);
      if (
        campaign.status === FLASH_SALE_CAMPAIGN_STATUS.ENDED ||
        campaign.status === FLASH_SALE_CAMPAIGN_STATUS.CANCELLED
      ) {
        throw new ConflictException('Chiến dịch đã kết thúc hoặc đã hủy, không thêm sửa sản phẩm được');
      }
      const variant = await transaction.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) throw new NotFoundException('Không tìm thấy biến thể sản phẩm');

      const existing = await transaction.flashSaleItem.findUnique({
        where: { campaignId_productVariantId: { campaignId: id, productVariantId: variantId } },
      });

      if (existing) {
        // Không cho hạ quota xuống dưới số đã bán/đang giữ: đó là oversell ngược.
        const committed = existing.soldQuantity + existing.reservedQuantity;
        if (input.quota < committed) {
          throw new ConflictException(
            `Quota mới (${input.quota}) nhỏ hơn số đã bán và đang giữ (${committed})`,
          );
        }
        await transaction.flashSaleItem.update({
          where: { id: existing.id },
          data: {
            salePrice: new Prisma.Decimal(input.salePrice),
            quota: input.quota,
            perCustomerLimit: input.perCustomerLimit ?? null,
            version: { increment: 1 },
          },
        });
      } else {
        await transaction.flashSaleItem.create({
          data: {
            campaignId: id,
            productVariantId: variantId,
            salePrice: new Prisma.Decimal(input.salePrice),
            quota: input.quota,
            perCustomerLimit: input.perCustomerLimit ?? null,
            status: FLASH_SALE_ITEM_STATUS.ACTIVE,
          },
        });
      }

      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: existing ? 'promotion.flash_sale.item.update' : 'promotion.flash_sale.item.create',
          entityType: 'FLASH_SALE_ITEM',
          entityId: campaignId,
          after: input as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
    });

    return this.getCampaign(campaignId);
  }

  async removeItem(
    campaignId: string,
    itemId: string,
    input: RemoveFlashSaleItemDto,
    context: MutationContext,
  ): Promise<FlashSaleCampaignDetailDto> {
    this.ensurePersistence();
    const id = toDatabaseId(itemId);

    await this.prisma.$transaction(async (transaction) => {
      const item = await transaction.flashSaleItem.findUnique({ where: { id } });
      if (!item || item.campaignId !== toDatabaseId(campaignId)) {
        throw new NotFoundException('Không tìm thấy sản phẩm trong chiến dịch');
      }
      this.assertVersion(item.version, input.expectedVersion);
      if (item.soldQuantity > 0 || item.reservedQuantity > 0) {
        // Đã phát sinh giao dịch thì không xóa lịch sử; chỉ ngừng bán.
        await transaction.flashSaleItem.update({
          where: { id },
          data: { status: FLASH_SALE_ITEM_STATUS.INACTIVE, version: { increment: 1 } },
        });
      } else {
        await transaction.flashSaleItem.delete({ where: { id } });
      }
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'promotion.flash_sale.item.remove',
          entityType: 'FLASH_SALE_ITEM',
          entityId: itemId,
          before: { quota: item.quota, soldQuantity: item.soldQuantity },
        },
        transaction,
      );
    });

    return this.getCampaign(campaignId);
  }

  // ─── Quota (FLS-03) ────────────────────────────────────────────────────────

  /**
   * Tra suất flash đang hiệu lực cho một nhóm biến thể.
   *
   * Dùng ở bước báo giá checkout: giá flash chỉ được áp khi campaign đang chạy
   * theo giờ server VÀ còn đủ suất. Đây mới là preview — quota thật sự bị giữ ở
   * `reserveQuota` khi khách xác nhận, nên giữa hai bước vẫn có thể hết suất và
   * checkout sẽ báo 409 thay vì âm thầm bán quá.
   */
  async resolveActiveDeals(
    client: Prisma.TransactionClient | PrismaService,
    productVariantIds: readonly bigint[],
    now: Date,
  ): Promise<Map<bigint, ActiveFlashDeal>> {
    const deals = new Map<bigint, ActiveFlashDeal>();
    if (productVariantIds.length === 0) return deals;
    const items = await client.flashSaleItem.findMany({
      where: {
        productVariantId: { in: [...productVariantIds] },
        status: FLASH_SALE_ITEM_STATUS.ACTIVE,
        campaign: {
          status: FLASH_SALE_CAMPAIGN_STATUS.ACTIVE,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      },
      orderBy: { salePrice: 'asc' },
    });
    for (const item of items) {
      const available = item.quota - item.soldQuantity - item.reservedQuantity;
      if (available <= 0) continue;
      // Nhiều campaign cùng chạy cho một SKU: lấy giá thấp nhất (đã sắp asc).
      if (deals.has(item.productVariantId)) continue;
      deals.set(item.productVariantId, {
        flashSaleItemId: item.id,
        salePrice: item.salePrice,
        availableQuantity: available,
        perCustomerLimit: item.perCustomerLimit,
      });
    }
    return deals;
  }

  /**
   * Giữ quota flash cho một checkout session.
   *
   * QUAN TRỌNG: hàm nhận sẵn `transaction` từ checkout để quota và tồn kho vật
   * lý cùng thắng hoặc cùng rollback. Quota flash KHÔNG thay thế inventory
   * reservation — hai thứ độc lập và phải giành được cả hai.
   *
   * Đọc `flashSaleItemId` đã snapshot lúc báo giá, **không tra lại** danh sách
   * suất đang chạy. Tra lại là nguyên nhân của ba lỗi cũ:
   * - báo giá lấy campaign rẻ nhất còn giữ quota lấy campaign tạo trước;
   * - một SKU nằm ở hai campaign thì trừ quota cả hai cho cùng một lần mua;
   * - combo bị tách thành linh kiện nên suất của combo không bao giờ khớp.
   *
   * Chống oversell bằng `updateMany` có điều kiện trên chính hàng dữ liệu
   * (compare-and-set): hai request song song thì chỉ một cái khớp, cái còn lại
   * nhận `count === 0` và bị từ chối.
   */
  async reserveQuota(
    transaction: Prisma.TransactionClient,
    checkoutSessionId: bigint,
    customerKey: string,
    lines: readonly FlashSaleQuotaLine[],
    now: Date,
  ): Promise<FlashSaleQuotaGrant[]> {
    const claimable = lines.filter((line) => line.flashSaleItemId !== null);
    if (claimable.length === 0) return [];

    const items = await transaction.flashSaleItem.findMany({
      where: { id: { in: claimable.map((line) => line.flashSaleItemId!) } },
      include: { campaign: { select: { status: true, startsAt: true, endsAt: true } } },
      orderBy: { id: 'asc' },
    });
    const itemById = new Map(items.map((item) => [item.id, item]));

    const expiresAt = new Date(now.getTime() + FLASH_SALE_QUOTA_TTL_MINUTES * 60_000);
    const grants: FlashSaleQuotaGrant[] = [];

    // Duyệt theo DÒNG CHECKOUT, không duyệt theo danh sách suất: mỗi dòng đúng
    // một suất, kể cả khi biến thể đó nằm trong nhiều campaign.
    for (const line of claimable) {
      const item = itemById.get(line.flashSaleItemId!);
      // Suất bị gỡ, campaign kết thúc hoặc chưa tới giờ giữa lúc báo giá và lúc
      // xác nhận: từ chối rõ ràng thay vì âm thầm bán theo giá đã giảm.
      if (
        !item ||
        item.status !== FLASH_SALE_ITEM_STATUS.ACTIVE ||
        item.campaign.status !== FLASH_SALE_CAMPAIGN_STATUS.ACTIVE ||
        item.campaign.startsAt > now ||
        item.campaign.endsAt <= now
      ) {
        throw new ConflictException(
          'Chương trình khuyến mãi đã kết thúc; vui lòng tải lại giỏ hàng để xem giá mới',
        );
      }

      await this.assertPerCustomerLimit(transaction, item, customerKey, line.quantity, checkoutSessionId);

      const claimed = await transaction.flashSaleItem.updateMany({
        where: {
          id: item.id,
          version: item.version,
          quota: { gte: item.soldQuantity + item.reservedQuantity + line.quantity },
        },
        data: { reservedQuantity: { increment: line.quantity }, version: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Suất flash sale vừa hết; vui lòng tải lại giỏ hàng');
      }

      await transaction.flashSaleQuotaReservation.create({
        data: {
          flashSaleItemId: item.id,
          checkoutSessionId,
          productVariantId: item.productVariantId,
          customerKey,
          idempotencyKey: `flash-quota:${item.id}:${checkoutSessionId}`,
          quantity: line.quantity,
          status: FLASH_SALE_QUOTA_STATUS.ACTIVE,
          expiresAt,
        },
      });

      grants.push({
        flashSaleItemId: item.id,
        productVariantId: item.productVariantId,
        quantity: line.quantity,
        salePrice: item.salePrice,
      });
    }

    return grants;
  }

  /**
   * Giới hạn mỗi khách phải cộng dồn qua nhiều lần đặt.
   *
   * Chỉ xét số lượng của một lần đặt là vô tác dụng: giới hạn 2 sản phẩm mà
   * khách đặt 10 đơn, mỗi đơn 2 cái thì lọt hết.
   *
   * HẠN CHẾ ĐÃ BIẾT: khách vãng lai định danh bằng khoá giỏ hàng, xoá cookie và
   * tạo giỏ mới thì lách được. Chống triệt để cần định danh khách vãng lai,
   * ngoài phạm vi V1 — đây là hàng rào chống mua gom vô ý, không phải chống gian lận.
   */
  private async assertPerCustomerLimit(
    transaction: Prisma.TransactionClient,
    item: { id: bigint; perCustomerLimit: number | null },
    customerKey: string,
    requestedQuantity: number,
    checkoutSessionId: bigint,
  ): Promise<void> {
    if (item.perCustomerLimit === null) return;
    if (requestedQuantity > item.perCustomerLimit) {
      throw new ConflictException(
        `Mỗi khách chỉ mua tối đa ${item.perCustomerLimit} sản phẩm trong chương trình flash sale`,
      );
    }

    const held = await transaction.flashSaleQuotaReservation.aggregate({
      where: {
        flashSaleItemId: item.id,
        customerKey,
        status: {
          in: [FLASH_SALE_QUOTA_STATUS.ACTIVE, FLASH_SALE_QUOTA_STATUS.COMMITTED],
        },
        // Bỏ qua chính checkout này để retry cùng một session không bị tính hai lần.
        checkoutSessionId: { not: checkoutSessionId },
      },
      _sum: { quantity: true },
    });
    const alreadyHeld = held._sum.quantity ?? 0;
    if (alreadyHeld + requestedQuantity > item.perCustomerLimit) {
      throw new ConflictException(
        `Bạn đã mua ${alreadyHeld} sản phẩm trong chương trình này; giới hạn là ${item.perCustomerLimit}`,
      );
    }
  }

  /** Trả quota về khi checkout hủy/hết hạn. Đã COMMITTED thì không đụng tới. */
  async releaseQuota(
    transaction: Prisma.TransactionClient,
    checkoutSessionId: bigint,
    reason: string,
    now: Date,
  ): Promise<number> {
    const reservations = await transaction.flashSaleQuotaReservation.findMany({
      where: { checkoutSessionId, status: FLASH_SALE_QUOTA_STATUS.ACTIVE },
      orderBy: { id: 'asc' },
    });
    for (const reservation of reservations) {
      await transaction.flashSaleItem.update({
        where: { id: reservation.flashSaleItemId },
        data: { reservedQuantity: { decrement: reservation.quantity }, version: { increment: 1 } },
      });
      await transaction.flashSaleQuotaReservation.update({
        where: { id: reservation.id },
        data: {
          status: FLASH_SALE_QUOTA_STATUS.RELEASED,
          releasedAt: now,
          releaseReason: reason,
          version: { increment: 1 },
        },
      });
    }
    return reservations.length;
  }

  /**
   * Chốt quota khi Order được tạo: chuyển reserved sang sold.
   * Tổng `sold + reserved` không đổi nên ràng buộc quota ở database vẫn giữ.
   */
  async commitQuota(
    transaction: Prisma.TransactionClient,
    checkoutSessionId: bigint,
    now: Date,
  ): Promise<number> {
    const reservations = await transaction.flashSaleQuotaReservation.findMany({
      where: { checkoutSessionId, status: FLASH_SALE_QUOTA_STATUS.ACTIVE },
      orderBy: { id: 'asc' },
    });
    for (const reservation of reservations) {
      await transaction.flashSaleItem.update({
        where: { id: reservation.flashSaleItemId },
        data: {
          reservedQuantity: { decrement: reservation.quantity },
          soldQuantity: { increment: reservation.quantity },
          version: { increment: 1 },
        },
      });
      await transaction.flashSaleQuotaReservation.update({
        where: { id: reservation.id },
        data: {
          status: FLASH_SALE_QUOTA_STATUS.COMMITTED,
          committedAt: now,
          version: { increment: 1 },
        },
      });
    }
    return reservations.length;
  }

  /**
   * Hoàn quota đã chốt khi đơn bị hủy trước lúc giao.
   *
   * Suất flash tính theo "đã bán", nên đơn hủy phải trả suất về pool; nếu không,
   * mỗi lần khách đặt rồi hủy là mất vĩnh viễn một suất của chương trình.
   */
  async revertCommittedQuota(
    transaction: Prisma.TransactionClient,
    checkoutSessionId: bigint,
    reason: string,
    now: Date,
  ): Promise<number> {
    const reservations = await transaction.flashSaleQuotaReservation.findMany({
      where: { checkoutSessionId, status: FLASH_SALE_QUOTA_STATUS.COMMITTED },
      orderBy: { id: 'asc' },
    });
    for (const reservation of reservations) {
      await transaction.flashSaleItem.update({
        where: { id: reservation.flashSaleItemId },
        data: { soldQuantity: { decrement: reservation.quantity }, version: { increment: 1 } },
      });
      await transaction.flashSaleQuotaReservation.update({
        where: { id: reservation.id },
        data: {
          status: FLASH_SALE_QUOTA_STATUS.RELEASED,
          releasedAt: now,
          releaseReason: reason,
          version: { increment: 1 },
        },
      });
    }
    return reservations.length;
  }

  // Dọn quota quá hạn nằm ở `FlashSaleQuotaExpiryService`: worker cần SKIP LOCKED
  // và batch có giới hạn để nhiều instance chạy song song không claim trùng.

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private toItemDto(item: LoadedItem): FlashSaleItemDto {
    const variant = item.productVariant;
    const media = variant.product.media[0]?.mediaAsset;
    const regular = variant.prices[0];
    return {
      id: toEntityId(item.id),
      productVariantId: toEntityId(item.productVariantId),
      sku: variant.sku,
      productName: variant.product.name,
      productSlug: variant.product.slug,
      imageUrl: media?.thumbnailUrl ?? media?.secureUrl ?? null,
      salePrice: item.salePrice.toFixed(2),
      regularPrice: regular ? regular.amount.toFixed(2) : null,
      quota: item.quota,
      soldQuantity: item.soldQuantity,
      availableQuantity: Math.max(item.quota - item.soldQuantity - item.reservedQuantity, 0),
      perCustomerLimit: item.perCustomerLimit,
      status: item.status,
      version: item.version.toString(),
    };
  }

  private toDetail(campaign: LoadedCampaign): FlashSaleCampaignDetailDto {
    return {
      id: toEntityId(campaign.id),
      code: campaign.code,
      name: campaign.name,
      description: campaign.description,
      startsAt: campaign.startsAt.toISOString(),
      endsAt: campaign.endsAt.toISOString(),
      status: campaign.status,
      itemCount: campaign.items.length,
      version: campaign.version.toString(),
      items: campaign.items.map((item) => this.toItemDto(item)),
    };
  }

  private async loadForMutation(transaction: Prisma.TransactionClient, id: bigint) {
    const campaign = await transaction.flashSaleCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Không tìm thấy chiến dịch flash sale');
    return campaign;
  }

  private assertVersion(current: bigint, expectedVersion: string): void {
    if (!/^\d+$/.test(expectedVersion)) {
      throw new BadRequestException('Phiên bản phải là số nguyên không âm');
    }
    if (current !== BigInt(expectedVersion)) {
      throw new ConflictException('Dữ liệu đã thay đổi; vui lòng tải lại trước khi thao tác');
    }
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) {
      throw new ServiceUnavailableException('Kho dữ liệu khuyến mãi chưa được bật');
    }
  }
}
