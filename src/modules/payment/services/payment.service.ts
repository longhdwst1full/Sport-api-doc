import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { MutationContext } from '../../../common/request/request-context';
import { PrismaService } from '../../../database/prisma.service';
import { ObjectStorageClient, StoredImageAsset } from '../../../integrations/object-storage/object-storage.client';
import { AuditWriter } from '../../audit/audit.writer';
import type { AuthPrincipal } from '../../auth/auth.types';
import { CartService } from '../../cart/cart.service';
import { CreateMediaUploadDto, SignedMediaUploadDto } from '../../media/media.dto';
import { ScopeType } from '../../iam/iam.types';
import {
  AdminPaymentListDto,
  AdminPaymentQueryDto,
  ConfirmPaymentDto,
  PaymentDetailDto,
  PaymentEvidenceDto,
  RejectPaymentDto,
  SubmitPaymentEvidenceDto,
} from '../dto/payment.dto';
import {
  PAYMENT_EVIDENCE_STATUS,
  PAYMENT_METHOD,
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  PAYMENT_TRANSACTION,
  PAYMENT_TRANSACTION_TYPE,
} from '../payment.constants';
import { PaymentProviderRegistry } from './payment-provider.registry';

type CustomerPaymentActor =
  | { type: 'GUEST'; cartId: bigint; accessHash: string }
  | { type: 'CUSTOMER'; userId: string };

const paymentInclude = {
  order: {
    include: {
      checkoutSession: { select: { cartId: true, cart: { select: { userId: true } } } },
      addresses: { orderBy: { id: 'asc' as const }, take: 1 },
    },
  },
  evidences: {
    orderBy: { createdAt: 'desc' as const },
    include: { mediaAsset: true },
  },
} satisfies Prisma.PaymentInclude;

const paymentSummaryInclude = {
  order: { select: { orderNo: true, addresses: { orderBy: { id: 'asc' as const }, take: 1 } } },
} satisfies Prisma.PaymentInclude;

type LoadedPayment = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
type LoadedPaymentSummary = Prisma.PaymentGetPayload<{ include: typeof paymentSummaryInclude }>;

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly storage: ObjectStorageClient,
    private readonly providers: PaymentProviderRegistry,
    private readonly config: ConfigService,
    private readonly audit: AuditWriter,
  ) {}

  async getGuest(cartToken: string, orderNo: string): Promise<PaymentDetailDto> {
    const actor = await this.guestActor(cartToken);
    return this.getOwned(orderNo, actor);
  }

  getAccount(userId: string, orderNo: string): Promise<PaymentDetailDto> {
    return this.getOwned(orderNo, { type: 'CUSTOMER', userId });
  }

  async createGuestUpload(
    cartToken: string,
    orderNo: string,
    input: CreateMediaUploadDto,
  ): Promise<SignedMediaUploadDto> {
    const actor = await this.guestActor(cartToken);
    return this.createEvidenceUpload(orderNo, input, actor);
  }

  createAccountUpload(
    userId: string,
    orderNo: string,
    input: CreateMediaUploadDto,
  ): Promise<SignedMediaUploadDto> {
    return this.createEvidenceUpload(orderNo, input, { type: 'CUSTOMER', userId });
  }

  async submitGuestEvidence(
    cartToken: string,
    orderNo: string,
    input: SubmitPaymentEvidenceDto,
    idempotencyKey: string,
    context: MutationContext,
  ): Promise<PaymentDetailDto> {
    const actor = await this.guestActor(cartToken);
    return this.submitEvidence(orderNo, input, idempotencyKey, context, actor);
  }

  submitAccountEvidence(
    userId: string,
    orderNo: string,
    input: SubmitPaymentEvidenceDto,
    idempotencyKey: string,
    context: MutationContext,
  ): Promise<PaymentDetailDto> {
    return this.submitEvidence(orderNo, input, idempotencyKey, context, { type: 'CUSTOMER', userId });
  }

  async listAdmin(query: AdminPaymentQueryDto, principal: AuthPrincipal): Promise<AdminPaymentListDto> {
    this.ensurePersistence();
    const where = this.adminWhere(query, principal);
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: paymentSummaryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return {
      items: payments.map((payment) => this.toSummary(payment)),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async getAdmin(id: string, principal: AuthPrincipal): Promise<PaymentDetailDto> {
    this.ensurePersistence();
    const payment = await this.prisma.payment.findFirst({
      where: { id: toDatabaseId(id), AND: [this.scopeWhere(principal)] },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException('Không tìm thấy thanh toán trong phạm vi được phân quyền');
    return this.toDetail(payment);
  }

  confirmAdmin(
    id: string,
    input: ConfirmPaymentDto,
    idempotencyKey: string,
    principal: AuthPrincipal,
    context: MutationContext,
  ): Promise<PaymentDetailDto> {
    return this.reviewAdmin(id, input, idempotencyKey, principal, context, 'CONFIRM');
  }

  rejectAdmin(
    id: string,
    input: RejectPaymentDto,
    idempotencyKey: string,
    principal: AuthPrincipal,
    context: MutationContext,
  ): Promise<PaymentDetailDto> {
    return this.reviewAdmin(id, input, idempotencyKey, principal, context, 'REJECT');
  }

  private async getOwned(orderNo: string, actor: CustomerPaymentActor): Promise<PaymentDetailDto> {
    this.ensurePersistence();
    const payment = await this.prisma.payment.findFirst({
      where: { order: { orderNo: orderNo.trim().toUpperCase() } },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException('Không tìm thấy thông tin thanh toán của đơn hàng');
    this.assertOwnership(payment, actor);
    return this.toDetail(payment);
  }

  private async createEvidenceUpload(
    orderNo: string,
    input: CreateMediaUploadDto,
    actor: CustomerPaymentActor,
  ): Promise<SignedMediaUploadDto> {
    const payment = await this.loadOwned(orderNo, actor);
    if (payment.method !== PAYMENT_METHOD.BANK_TRANSFER) {
      throw new ConflictException('Đơn COD không sử dụng bằng chứng chuyển khoản');
    }
    if (![PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED, PAYMENT_STATUS.NEED_REVIEW].includes(payment.status as never)) {
      throw new ConflictException('Thanh toán không còn nhận thêm bằng chứng');
    }
    const rootFolder = this.config.get<string>('cloudinary.folder') ?? 'sport-sys/sport';
    return this.storage.createSignedImageUpload({
      publicId: randomUUID(),
      folder: `${rootFolder}/payment-evidence/${payment.paymentRef}`,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: 15 * 60,
    });
  }

  private async submitEvidence(
    orderNo: string,
    input: SubmitPaymentEvidenceDto,
    rawIdempotencyKey: string,
    context: MutationContext,
    actor: CustomerPaymentActor,
  ): Promise<PaymentDetailDto> {
    this.ensurePersistence();
    const idempotencyKey = this.requireIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.requestHash({ orderNo: orderNo.trim().toUpperCase(), ...input });
    // External verification is intentionally outside the database transaction so
    // a slow provider never holds the payment/order row lock.
    const verified = await this.storage.verifyImageUpload({
      publicId: input.publicId,
      version: input.providerVersion,
      signature: input.providerSignature,
    });

    return this.withSerializationRetry(async () => this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`
        SELECT payment.id
        FROM payments payment
        JOIN orders customer_order ON customer_order.id = payment.order_id
        WHERE customer_order.order_no = ${orderNo.trim().toUpperCase()}
        FOR UPDATE OF payment, customer_order
      `);
      const payment = await transaction.payment.findFirst({
        where: { order: { orderNo: orderNo.trim().toUpperCase() } },
        include: paymentInclude,
      });
      if (!payment) throw new NotFoundException('Không tìm thấy thông tin thanh toán của đơn hàng');
      this.assertOwnership(payment, actor);
      const replay = await transaction.paymentTransaction.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.paymentId !== payment.id || replay.requestHash !== requestHash) {
          throw new ConflictException('Idempotency-Key đã được dùng cho yêu cầu thanh toán khác');
        }
        return this.toDetail(payment);
      }
      if (payment.method !== PAYMENT_METHOD.BANK_TRANSFER) {
        throw new ConflictException('Đơn COD không sử dụng bằng chứng chuyển khoản');
      }
      if (payment.version !== this.toExpectedVersion(input.expectedVersion)) {
        throw new ConflictException('Thông tin thanh toán đã thay đổi; vui lòng tải lại trước khi gửi');
      }
      if (![PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED, PAYMENT_STATUS.NEED_REVIEW].includes(payment.status as never)) {
        throw new ConflictException('Thanh toán không còn nhận thêm bằng chứng');
      }

      const mediaAsset = await this.upsertVerifiedAsset(transaction, verified, actor);
      const fileHash = this.requestHash({
        providerAssetId: verified.providerAssetId,
        version: verified.version,
        sizeBytes: verified.sizeBytes,
      });
      await transaction.paymentEvidence.create({
        data: {
          paymentId: payment.id,
          mediaAssetId: mediaAsset.id,
          uploadedBy: actor.type === 'CUSTOMER' ? toDatabaseId(actor.userId) : null,
          uploaderType: actor.type,
          guestAccessId: actor.type === 'GUEST' ? actor.accessHash : null,
          fileHash,
          note: input.note?.trim() || null,
          status: PAYMENT_EVIDENCE_STATUS.PENDING_REVIEW,
        },
      });
      await transaction.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          transactionType: PAYMENT_TRANSACTION_TYPE.EVIDENCE_SUBMITTED,
          provider: PAYMENT_PROVIDER.MANUAL_BANK_TRANSFER,
          idempotencyKey,
          requestHash,
          amount: 0,
          currencyCode: payment.currencyCode,
          status: PAYMENT_STATUS.PENDING,
          occurredAt: new Date(),
        },
      });
      await transaction.payment.update({
        where: { id: payment.id },
        data: { status: PAYMENT_STATUS.AWAITING_CONFIRMATION, failureReason: null, version: { increment: 1 } },
      });
      await transaction.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: PAYMENT_STATUS.AWAITING_CONFIRMATION, version: { increment: 1 } },
      });
      await this.audit.write({
        requestId: context.requestId,
        sequenceNo: 1,
        actorType: actor.type === 'GUEST' ? 'GUEST' : 'USER',
        actorUserId: actor.type === 'CUSTOMER' ? actor.userId : undefined,
        action: 'payment.evidence.submit',
        entityType: 'PAYMENT',
        entityId: toEntityId(payment.id),
        after: { mediaAssetId: toEntityId(mediaAsset.id), status: PAYMENT_STATUS.AWAITING_CONFIRMATION },
      }, transaction);
      const updated = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
      return this.toDetail(updated);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: PAYMENT_TRANSACTION.MAX_WAIT_MS,
      timeout: PAYMENT_TRANSACTION.TIMEOUT_MS,
    }));
  }

  private async reviewAdmin(
    id: string,
    input: ConfirmPaymentDto | RejectPaymentDto,
    rawIdempotencyKey: string,
    principal: AuthPrincipal,
    context: MutationContext,
    action: 'CONFIRM' | 'REJECT',
  ): Promise<PaymentDetailDto> {
    this.ensurePersistence();
    const paymentId = toDatabaseId(id);
    const idempotencyKey = this.requireIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.requestHash({ action, paymentId: id, ...input });

    return this.withSerializationRetry(async () => this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM payments WHERE id = ${paymentId} FOR UPDATE`);
      const payment = await transaction.payment.findFirst({
        where: { id: paymentId, AND: [this.scopeWhere(principal)] },
        include: paymentInclude,
      });
      if (!payment) throw new NotFoundException('Không tìm thấy thanh toán trong phạm vi được phân quyền');
      const replay = await transaction.paymentTransaction.findUnique({ where: { idempotencyKey } });
      if (replay) {
        if (replay.paymentId !== payment.id || replay.requestHash !== requestHash) {
          throw new ConflictException('Idempotency-Key đã được dùng cho yêu cầu thanh toán khác');
        }
        return this.toDetail(payment);
      }
      if (payment.version !== this.toExpectedVersion(input.expectedVersion)) {
        throw new ConflictException('Thông tin thanh toán đã thay đổi; vui lòng tải lại trước khi xử lý');
      }
      if (payment.status === PAYMENT_STATUS.SUCCESS || payment.status === PAYMENT_STATUS.CANCELLED) {
        throw new ConflictException('Thanh toán đã ở trạng thái kết thúc');
      }

      const now = new Date();
      if (action === 'REJECT') {
        const reason = (input as RejectPaymentDto).reason.trim();
        await transaction.payment.update({
          where: { id: payment.id },
          data: { status: PAYMENT_STATUS.FAILED, failureReason: reason, receivedAmount: 0, version: { increment: 1 } },
        });
        await transaction.paymentEvidence.updateMany({
          where: { paymentId: payment.id, status: PAYMENT_EVIDENCE_STATUS.PENDING_REVIEW },
          data: { status: PAYMENT_EVIDENCE_STATUS.REJECTED, reviewedBy: toDatabaseId(principal.userId), reviewedAt: now, reviewReason: reason },
        });
        await transaction.order.update({ where: { id: payment.orderId }, data: { paymentStatus: PAYMENT_STATUS.FAILED, version: { increment: 1 } } });
        await transaction.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            transactionType: PAYMENT_TRANSACTION_TYPE.REJECTED,
            provider: payment.method === PAYMENT_METHOD.COD ? PAYMENT_PROVIDER.INTERNAL_COD : PAYMENT_PROVIDER.MANUAL_BANK_TRANSFER,
            idempotencyKey,
            requestHash,
            amount: 0,
            currencyCode: payment.currencyCode,
            status: PAYMENT_STATUS.FAILED,
            rawPayloadRedacted: { reason },
            occurredAt: now,
          },
        });
      } else {
        const command = input as ConfirmPaymentDto;
        if (payment.method === PAYMENT_METHOD.BANK_TRANSFER && payment.status !== PAYMENT_STATUS.AWAITING_CONFIRMATION && payment.status !== PAYMENT_STATUS.NEED_REVIEW) {
          throw new ConflictException('Chuyển khoản chưa có bằng chứng chờ xác nhận');
        }
        if (payment.method === PAYMENT_METHOD.COD && payment.order.status !== 'DELIVERED') {
          throw new ConflictException('Chỉ xác nhận thu tiền COD sau khi đơn đã giao');
        }
        const receivedAmount = new Prisma.Decimal(command.receivedAmount);
        const isExact = receivedAmount.equals(payment.expectedAmount);
        const nextStatus = isExact ? PAYMENT_STATUS.SUCCESS : PAYMENT_STATUS.NEED_REVIEW;
        await transaction.payment.update({
          where: { id: payment.id },
          data: {
            status: nextStatus,
            receivedAmount,
            confirmedBy: isExact ? toDatabaseId(principal.userId) : null,
            confirmedAt: isExact ? now : null,
            failureReason: isExact ? null : 'Số tiền nhận không khớp số tiền phải thanh toán',
            version: { increment: 1 },
          },
        });
        if (isExact) {
          await transaction.paymentEvidence.updateMany({
            where: { paymentId: payment.id, status: PAYMENT_EVIDENCE_STATUS.PENDING_REVIEW },
            data: { status: PAYMENT_EVIDENCE_STATUS.ACCEPTED, reviewedBy: toDatabaseId(principal.userId), reviewedAt: now, reviewReason: command.note?.trim() || null },
          });
        }
        await transaction.order.update({ where: { id: payment.orderId }, data: { paymentStatus: nextStatus, version: { increment: 1 } } });
        await transaction.paymentTransaction.create({
          data: {
            paymentId: payment.id,
            transactionType: payment.method === PAYMENT_METHOD.COD ? PAYMENT_TRANSACTION_TYPE.COD_COLLECTED : PAYMENT_TRANSACTION_TYPE.CONFIRMED,
            provider: payment.method === PAYMENT_METHOD.COD ? PAYMENT_PROVIDER.INTERNAL_COD : PAYMENT_PROVIDER.MANUAL_BANK_TRANSFER,
            externalId: command.reference.trim(),
            idempotencyKey,
            requestHash,
            amount: receivedAmount,
            currencyCode: payment.currencyCode,
            status: nextStatus,
            rawPayloadRedacted: command.note ? { note: command.note.trim() } : undefined,
            occurredAt: now,
          },
        });
      }

      await this.audit.write({
        requestId: context.requestId,
        sequenceNo: 1,
        actorType: 'USER',
        actorUserId: principal.userId,
        action: action === 'CONFIRM' ? 'payment.confirm' : 'payment.reject',
        entityType: 'PAYMENT',
        entityId: toEntityId(payment.id),
        before: { status: payment.status, version: payment.version.toString() },
        after: { action },
      }, transaction);
      const updated = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
      return this.toDetail(updated);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: PAYMENT_TRANSACTION.MAX_WAIT_MS,
      timeout: PAYMENT_TRANSACTION.TIMEOUT_MS,
    }));
  }

  private async loadOwned(orderNo: string, actor: CustomerPaymentActor): Promise<LoadedPayment> {
    this.ensurePersistence();
    const payment = await this.prisma.payment.findFirst({
      where: { order: { orderNo: orderNo.trim().toUpperCase() } },
      include: paymentInclude,
    });
    if (!payment) throw new NotFoundException('Không tìm thấy thông tin thanh toán của đơn hàng');
    this.assertOwnership(payment, actor);
    return payment;
  }

  private assertOwnership(payment: LoadedPayment, actor: CustomerPaymentActor): void {
    if (actor.type === 'GUEST') {
      if (payment.order.checkoutSession.cartId !== actor.cartId) {
        throw new NotFoundException('Không tìm thấy thông tin thanh toán của đơn hàng');
      }
      return;
    }
    if (payment.order.checkoutSession.cart.userId !== toDatabaseId(actor.userId)) {
      throw new NotFoundException('Không tìm thấy thông tin thanh toán của đơn hàng');
    }
  }

  private async guestActor(cartToken: string): Promise<CustomerPaymentActor> {
    const normalized = cartToken.trim();
    const cartId = await this.carts.resolveGuestCartIdForOrder(normalized);
    return { type: 'GUEST', cartId, accessHash: createHash('sha256').update(normalized).digest('hex') };
  }

  private async upsertVerifiedAsset(
    transaction: Prisma.TransactionClient,
    verified: StoredImageAsset,
    actor: CustomerPaymentActor,
  ) {
    const existing = await transaction.mediaAsset.findUnique({
      where: { provider_providerAssetId: { provider: verified.provider, providerAssetId: verified.providerAssetId } },
    });
    if (existing) {
      if (existing.status !== 'ACTIVE') throw new ConflictException('Ảnh bằng chứng đã bị vô hiệu hóa');
      return existing;
    }
    return transaction.mediaAsset.create({
      data: {
        provider: verified.provider,
        providerAssetId: verified.providerAssetId,
        publicId: verified.publicId,
        resourceType: 'IMAGE',
        secureUrl: verified.secureUrl,
        thumbnailUrl: verified.thumbnailUrl,
        format: verified.format,
        mimeType: verified.mimeType,
        width: verified.width,
        height: verified.height,
        sizeBytes: BigInt(verified.sizeBytes),
        checksum: this.requestHash({ providerAssetId: verified.providerAssetId, version: verified.version, sizeBytes: verified.sizeBytes }),
        folder: verified.publicId.split('/').slice(0, -1).join('/') || null,
        metadataJson: { providerVersion: verified.version, purpose: 'PAYMENT_EVIDENCE' },
        status: 'ACTIVE',
        uploadedBy: actor.type === 'CUSTOMER' ? toDatabaseId(actor.userId) : null,
      },
    });
  }

  private adminWhere(query: AdminPaymentQueryDto, principal: AuthPrincipal): Prisma.PaymentWhereInput {
    const filters: Prisma.PaymentWhereInput[] = [this.scopeWhere(principal)];
    if (query.status) filters.push({ status: query.status });
    if (query.method) filters.push({ method: query.method });
    if (query.search?.trim()) {
      const search = query.search.trim();
      filters.push({ OR: [
        { paymentRef: { contains: search, mode: 'insensitive' } },
        { order: { orderNo: { contains: search, mode: 'insensitive' } } },
        { order: { addresses: { some: { recipientName: { contains: search, mode: 'insensitive' } } } } },
        { order: { addresses: { some: { recipientPhone: { contains: search, mode: 'insensitive' } } } } },
      ] });
    }
    return { AND: filters };
  }

  private scopeWhere(principal: AuthPrincipal): Prisma.PaymentWhereInput {
    if (principal.scopes.some((scope) => scope.type === ScopeType.GLOBAL)) return {};
    const branchIds = principal.scopes
      .filter((scope) => scope.type === ScopeType.BRANCH && scope.branchId)
      .map((scope) => toDatabaseId(scope.branchId!));
    if (branchIds.length === 0) throw new ForbiddenException('Tài khoản chưa được gán phạm vi chi nhánh');
    return { order: { branchId: { in: branchIds } } };
  }

  private toDetail(payment: LoadedPayment): PaymentDetailDto {
    const instruction = this.providers.get(payment.method as 'COD' | 'BANK_TRANSFER').createInstruction({
      paymentId: payment.paymentRef,
      orderId: payment.order.orderNo,
      amountMinor: Number(payment.expectedAmount),
      currency: 'VND',
    });
    return {
      id: toEntityId(payment.id),
      orderId: toEntityId(payment.orderId),
      orderNo: payment.order.orderNo,
      orderStatus: payment.order.status,
      paymentRef: payment.paymentRef,
      method: payment.method,
      status: payment.status,
      expectedAmount: payment.expectedAmount.toFixed(2),
      receivedAmount: payment.receivedAmount.toFixed(2),
      currencyCode: payment.currencyCode,
      expiresAt: payment.expiresAt?.toISOString(),
      confirmedAt: payment.confirmedAt?.toISOString(),
      failureReason: payment.failureReason ?? undefined,
      version: payment.version.toString(),
      instruction,
      evidences: payment.evidences.map((evidence) => this.toEvidence(evidence)),
    };
  }

  private toEvidence(evidence: LoadedPayment['evidences'][number]): PaymentEvidenceDto {
    return {
      id: toEntityId(evidence.id),
      mediaAssetId: toEntityId(evidence.mediaAssetId),
      fileUrl: evidence.mediaAsset.secureUrl,
      thumbnailUrl: evidence.mediaAsset.thumbnailUrl ?? evidence.mediaAsset.secureUrl,
      mimeType: evidence.mediaAsset.mimeType ?? 'image/*',
      sizeBytes: Number(evidence.mediaAsset.sizeBytes ?? 0),
      status: evidence.status,
      note: evidence.note ?? undefined,
      reviewReason: evidence.reviewReason ?? undefined,
      createdAt: evidence.createdAt.toISOString(),
      reviewedAt: evidence.reviewedAt?.toISOString(),
    };
  }

  private toSummary(payment: LoadedPaymentSummary) {
    const recipient = payment.order.addresses[0];
    return {
      id: toEntityId(payment.id),
      paymentRef: payment.paymentRef,
      orderNo: payment.order.orderNo,
      recipientName: recipient?.recipientName ?? '',
      recipientPhone: recipient?.recipientPhone ?? '',
      method: payment.method,
      status: payment.status,
      expectedAmount: payment.expectedAmount.toFixed(2),
      receivedAmount: payment.receivedAmount.toFixed(2),
      createdAt: payment.createdAt.toISOString(),
      version: payment.version.toString(),
    };
  }

  private requireIdempotencyKey(value: string): string {
    const key = value.trim();
    if (key.length < 8 || key.length > 150) {
      throw new BadRequestException('Idempotency-Key phải có từ 8 đến 150 ký tự');
    }
    return key;
  }

  private toExpectedVersion(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('Phiên bản thanh toán phải là số nguyên không âm');
    }
    return BigInt(value);
  }

  private requestHash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async withSerializationRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < PAYMENT_TRANSACTION.MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const code = error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : (error as { code?: unknown })?.code;
        if ((code === 'P2034' || code === '40001') && attempt + 1 < PAYMENT_TRANSACTION.MAX_SERIALIZATION_RETRIES) continue;
        throw error;
      }
    }
    throw new ServiceUnavailableException('Không thể xử lý thanh toán do xung đột đồng thời; vui lòng thử lại');
  }

  private ensurePersistence(): void {
    if (!this.prisma.isEnabled()) throw new ServiceUnavailableException('Kho dữ liệu thanh toán chưa được bật');
  }
}
