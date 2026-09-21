import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import type { MutationContext } from '../../common/request/request-context';
import type { AuthPrincipal } from '../auth/auth.types';
import { AuditWriter } from '../audit/audit.writer';
import { ScopeType } from '../iam/iam.types';
import { normalizeVietnamesePhone } from '../auth/phone-normalization';
import {
  CUSTOMER_ADDRESS_TYPE,
  CUSTOMER_AUDIT_ACTION,
  CUSTOMER_COUNTRY,
  CUSTOMER_STATUS,
} from './customer.constants';
import {
  AdminCustomerAddressInputDto,
  AdminCustomerDetailDto,
  AdminCustomerListDto,
  AdminCustomerQueryDto,
  AdminCustomerSummaryDto,
  CreateAdminCustomerDto,
  CustomerStatusCommandDto,
  UpdateAdminCustomerDto,
  type CustomerKind,
} from './admin-customer.dto';

/**
 * Sau khi tạo, hồ sơ chưa có đơn nào nên bộ lọc phạm vi theo chi nhánh sẽ không tìm thấy nó.
 * Đọc lại bằng phạm vi toàn hệ thống chỉ để trả kết quả của chính lệnh vừa chạy.
 */
const GLOBAL_ACTOR = {
  scopes: [{ type: ScopeType.GLOBAL }],
} as AuthPrincipal;

/** Đơn đã huỷ không phải lần mua hàng; không tính vào số đơn lẫn giá trị vòng đời. */
const CANCELLED_STATUS = 'CANCELLED';
/**
 * Giá trị vòng đời = tiền khách đã THỰC TRẢ, nên đo bằng trạng thái thanh toán chứ không
 * bằng trạng thái đơn. Đơn bán tại quầy dừng ở `DELIVERED` (khách trả tiền và cầm hàng về
 * ngay) và không bao giờ tự chuyển `COMPLETED`; lấy theo `COMPLETED` sẽ làm mọi khách mua
 * tại quầy có giá trị vòng đời bằng 0.
 *
 * Khác với báo cáo doanh thu — nơi `COMPLETED` là doanh thu thực nhận và `DELIVERED` là
 * dự thu — vì hai chỗ trả lời hai câu hỏi khác nhau.
 */
const PAID_STATUS = 'SUCCESS';

interface OrderRollup {
  orderCount: number;
  lifetimeValue: Prisma.Decimal;
  lastOrderAt: Date | null;
}

@Injectable()
export class AdminCustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Chi nhánh mà tài khoản được phép nhìn thấy; `undefined` nghĩa là toàn hệ thống.
   * Khách hàng không gắn trực tiếp vào chi nhánh nào — quan hệ đi qua đơn hàng của họ.
   */
  private visibleBranchIds(actor: AuthPrincipal): bigint[] | undefined {
    if (actor.scopes.some(({ type }) => type === ScopeType.GLOBAL)) return undefined;
    return actor.scopes.flatMap(({ type, branchId }) =>
      type === ScopeType.BRANCH && branchId ? [toDatabaseId(branchId)] : [],
    );
  }

  /** Nhân viên chi nhánh chỉ thấy khách đã từng mua ở chi nhánh mình phụ trách. */
  private customerScopeWhere(branchIds: bigint[] | undefined): Prisma.CustomerWhereInput {
    if (!branchIds) return {};
    return { orders: { some: { branchId: { in: branchIds } } } };
  }

  async list(query: AdminCustomerQueryDto, actor: AuthPrincipal): Promise<AdminCustomerListDto> {
    const branchIds = this.visibleBranchIds(actor);
    const where: Prisma.CustomerWhereInput = {
      ...this.customerScopeWhere(branchIds),
      ...(query.name ? { name: { contains: query.name.trim(), mode: 'insensitive' } } : {}),
      ...(query.phone ? { phone: { contains: query.phone.trim() } } : {}),
      ...(query.email ? { email: { contains: query.email.trim(), mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      // MEMBER/GUEST không phải cột riêng: khách có tài khoản đăng nhập thì mới là thành viên.
      ...(query.kind === 'MEMBER' ? { userId: { not: null } } : {}),
      ...(query.kind === 'GUEST' ? { userId: null } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.customer.count({ where }),
    ]);

    const rollups = await this.orderRollups(rows.map((row) => row.id), branchIds);
    return {
      items: rows.map((row) => this.toSummary(row, rollups.get(row.id.toString()))),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  async get(id: string, actor: AuthPrincipal): Promise<AdminCustomerDetailDto> {
    const databaseId = toDatabaseId(id);
    const branchIds = this.visibleBranchIds(actor);
    // Dùng `findFirst` kèm điều kiện phạm vi: khách ngoài chi nhánh trả "không tìm thấy"
    // thay vì "không có quyền", để không lộ việc khách đó có tồn tại hay không.
    const customer = await this.prisma.customer.findFirst({
      where: { id: databaseId, ...this.customerScopeWhere(branchIds) },
      include: {
        avatarAsset: { select: { id: true, secureUrl: true, thumbnailUrl: true } },
        addresses: {
          where: { status: 'ACTIVE' },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
        orders: {
          // Đơn của chi nhánh khác không thuộc phạm vi xem của nhân viên chi nhánh.
          where: branchIds ? { branchId: { in: branchIds } } : undefined,
          orderBy: { placedAt: 'desc' },
          take: 20,
          select: {
            id: true,
            orderNo: true,
            status: true,
            paymentStatus: true,
            grandTotal: true,
            placedAt: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');

    const rollups = await this.orderRollups([customer.id], branchIds);
    return {
      ...this.toSummary(customer, rollups.get(customer.id.toString())),
      addresses: customer.addresses.map((address) => ({
        id: toEntityId(address.id),
        recipient: address.recipient,
        phone: address.phone,
        addressLine: address.addressLine,
        ward: address.ward,
        district: address.district,
        provinceCode: address.provinceCode,
        isDefault: address.isDefault,
      })),
      recentOrders: customer.orders.map((order) => ({
        id: toEntityId(order.id),
        orderNo: order.orderNo,
        status: order.status,
        paymentStatus: order.paymentStatus,
        grandTotal: order.grandTotal.toFixed(2),
        placedAt: order.placedAt.toISOString(),
      })),
    };
  }

  /**
   * Tạo hồ sơ khách do nhân viên nhập hộ.
   *
   * INVARIANT: khách tạo ở đây không có tài khoản đăng nhập (`userId` rỗng) nên luôn là GUEST.
   * Muốn thành MEMBER thì khách phải tự đăng ký qua Storefront.
   */
  async create(
    input: CreateAdminCustomerDto,
    actor: AuthPrincipal,
    context: MutationContext,
  ): Promise<AdminCustomerDetailDto> {
    // SECURITY: Customer chưa có đơn không có quan hệ branch để scope. Chỉ GLOBAL được tạo
    // hồ sơ độc lập; nhân viên chi nhánh tạo khách qua POS/đơn để quan hệ branch hình thành atomic.
    if (!actor.scopes.some(({ type }) => type === ScopeType.GLOBAL)) {
      throw new ForbiddenException(
        'Tài khoản chi nhánh chỉ tạo khách trong luồng bán hàng hoặc đơn hàng.',
      );
    }
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Tên khách hàng không được để trống');
    const phone = this.normalizePhone(input.phone);
    const email = this.normalizeEmail(input.email);
    // Contract bắt buộc cả hai, nhưng chuỗi toàn khoảng trắng vượt qua được validator độ dài.
    if (!phone || !email) {
      throw new BadRequestException('Hồ sơ khách cần cả số điện thoại và email');
    }
    await this.assertContactNotTaken(phone, email);
    const avatarAssetId = await this.resolveAvatarAssetId(input.avatarAssetId);
    const addresses = this.validateAddressInput(input.addresses);

    const created = await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.customer.create({
        data: {
          // Khách do Admin tạo không gắn với user nào, nên dùng mã ngẫu nhiên như khách vãng lai.
          customerNo: `CUS-A-${randomUUID().replaceAll('-', '').slice(0, 18).toUpperCase()}`,
          name,
          phone: phone.value,
          normalizedPhone: phone.normalized,
          email: email.value,
          normalizedEmail: email.normalized,
          marketingConsent: input.marketingConsent ?? false,
          status: CUSTOMER_STATUS.ACTIVE,
          ...(avatarAssetId !== undefined ? { avatarAssetId } : {}),
        },
        select: { id: true, customerNo: true },
      });
      // TRANSACTION: địa chỉ phải nằm cùng transaction với hồ sơ; tạo khách xong mới lỗi địa chỉ
      // sẽ để lại hồ sơ thiếu nơi giao hàng mà người nhập tưởng đã lưu đủ.
      if (addresses) await this.syncAddresses(transaction, row.id, addresses);
      // SECURITY: Audit chỉ lưu mã khách và trạng thái; không chép email/SĐT/tên vào log PII.
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: CUSTOMER_AUDIT_ACTION.CREATE,
          entityType: 'CUSTOMER',
          entityId: toEntityId(row.id),
          after: {
            customerNo: row.customerNo,
            status: CUSTOMER_STATUS.ACTIVE,
            kind: 'GUEST',
          },
        },
        transaction,
      );
      return row;
    });
    return this.get(toEntityId(created.id), GLOBAL_ACTOR);
  }

  /**
   * TRANSACTION: cập nhật theo `expectedVersion`. Hai người sửa cùng lúc thì đúng một người thắng,
   * người còn lại phải tải lại — nếu không, thay đổi của họ ghi đè im lặng lên nhau.
   */
  async update(
    id: string,
    input: UpdateAdminCustomerDto,
    actor: AuthPrincipal,
    context: MutationContext,
  ): Promise<AdminCustomerDetailDto> {
    const current = await this.loadInScope(id, actor);
    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException('Tên khách hàng không được để trống');
    }
    const phone = input.phone === undefined ? undefined : this.normalizePhone(input.phone);
    const email = input.email === undefined ? undefined : this.normalizeEmail(input.email);
    // Liên hệ là bắt buộc trên hồ sơ: gửi lên thì phải có giá trị, không gửi thì giữ nguyên giá trị cũ.
    if (input.phone !== undefined && !phone) {
      throw new BadRequestException('Số điện thoại không được để trống');
    }
    if (input.email !== undefined && !email) {
      throw new BadRequestException('Email không được để trống');
    }
    const effectivePhone = phone === undefined ? current.phone : (phone?.value ?? null);
    const effectiveEmail = email === undefined ? current.email : (email?.value ?? null);
    if (!effectivePhone || !effectiveEmail) {
      throw new BadRequestException('Hồ sơ khách cần cả số điện thoại và email');
    }
    await this.assertContactNotTaken(phone, email, current.id);
    const avatarAssetId = input.avatarAssetId === undefined
      ? undefined
      : input.avatarAssetId === null
        ? null
        : await this.resolveAvatarAssetId(input.avatarAssetId);
    const addresses = this.validateAddressInput(input.addresses);

    const changedFields = (
      ['name', 'phone', 'email', 'marketingConsent', 'avatarAssetId', 'addresses'] as const
    ).filter((field) => input[field] !== undefined);
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.customer.updateMany({
        where: { id: current.id, version: BigInt(input.expectedVersion) },
        data: {
          ...(input.name !== undefined ? { name } : {}),
          ...(phone !== undefined
            ? { phone: phone?.value ?? null, normalizedPhone: phone?.normalized ?? null }
            : {}),
          ...(email !== undefined
            ? { email: email?.value ?? null, normalizedEmail: email?.normalized ?? null }
            : {}),
          ...(input.marketingConsent !== undefined
            ? { marketingConsent: input.marketingConsent }
            : {}),
          ...(avatarAssetId !== undefined ? { avatarAssetId } : {}),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Hồ sơ khách vừa thay đổi. Vui lòng tải lại rồi thử lại.');
      }
      // TRANSACTION: version của Customer là khoá chung cho cả hồ sơ lẫn địa chỉ. Ghi địa chỉ sau
      // khi `updateMany` đã thắng version nghĩa là hai người sửa song song không trộn địa chỉ vào nhau.
      if (addresses) await this.syncAddresses(transaction, current.id, addresses);
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: CUSTOMER_AUDIT_ACTION.UPDATE,
          entityType: 'CUSTOMER',
          entityId: id,
          before: { version: Number(current.version) },
          after: { changedFields, version: input.expectedVersion + 1 },
        },
        transaction,
      );
    });
    return this.get(id, actor);
  }

  /** Ngừng hoạt động: giữ nguyên lịch sử mua hàng, chỉ chặn dùng tiếp hồ sơ này. */
  async deactivate(
    id: string,
    input: CustomerStatusCommandDto,
    actor: AuthPrincipal,
    context: MutationContext,
  ): Promise<AdminCustomerDetailDto> {
    return this.changeStatus(id, input, actor, context, CUSTOMER_STATUS.INACTIVE);
  }

  async activate(
    id: string,
    input: CustomerStatusCommandDto,
    actor: AuthPrincipal,
    context: MutationContext,
  ): Promise<AdminCustomerDetailDto> {
    return this.changeStatus(id, input, actor, context, CUSTOMER_STATUS.ACTIVE);
  }

  /**
   * Xoá hẳn hồ sơ khách.
   *
   * INVARIANT: chỉ xoá được khách chưa phát sinh đơn và không có tài khoản đăng nhập. Khách đã mua
   * hàng là một phần của lịch sử đơn — xoá đi thì báo cáo doanh thu và truy vết bảo hành mất gốc,
   * nên trường hợp đó phải dùng "Ngừng hoạt động".
   */
  async remove(
    id: string,
    input: CustomerStatusCommandDto,
    actor: AuthPrincipal,
    context: MutationContext,
  ): Promise<void> {
    const current = await this.loadInScope(id, actor);
    if (current.userId !== null) {
      throw new ConflictException(
        'Khách có tài khoản đăng nhập nên không xoá được. Hãy dùng Ngừng hoạt động.',
      );
    }
    await this.prisma.$transaction(async (transaction) => {
      const orderCount = await transaction.order.count({ where: { customerId: current.id } });
      if (orderCount > 0) {
        throw new ConflictException(
          'Khách đã có đơn hàng nên không xoá được. Hãy dùng Ngừng hoạt động.',
        );
      }
      const deleted = await transaction.customer.deleteMany({
        where: { id: current.id, version: BigInt(input.expectedVersion) },
      });
      if (deleted.count !== 1) {
        throw new ConflictException('Hồ sơ khách vừa thay đổi. Vui lòng tải lại rồi thử lại.');
      }
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: CUSTOMER_AUDIT_ACTION.DELETE,
          entityType: 'CUSTOMER',
          entityId: id,
          before: { status: current.status, version: Number(current.version) },
          after: { deleted: true },
          reason: input.reason,
        },
        transaction,
      );
    });
  }

  private async changeStatus(
    id: string,
    input: CustomerStatusCommandDto,
    actor: AuthPrincipal,
    context: MutationContext,
    status: string,
  ): Promise<AdminCustomerDetailDto> {
    const current = await this.loadInScope(id, actor);
    if (current.status === status) {
      throw new ConflictException('Khách hàng đã ở trạng thái này');
    }
    await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.customer.updateMany({
        where: { id: current.id, version: BigInt(input.expectedVersion) },
        data: { status, version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Hồ sơ khách vừa thay đổi. Vui lòng tải lại rồi thử lại.');
      }
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action:
            status === CUSTOMER_STATUS.ACTIVE
              ? CUSTOMER_AUDIT_ACTION.ACTIVATE
              : CUSTOMER_AUDIT_ACTION.DEACTIVATE,
          entityType: 'CUSTOMER',
          entityId: id,
          before: { status: current.status, version: Number(current.version) },
          after: { status, version: input.expectedVersion + 1 },
          reason: input.reason,
        },
        transaction,
      );
    });
    return this.get(id, actor);
  }

  private async loadInScope(
    id: string,
    actor: AuthPrincipal,
  ): Promise<{
    id: bigint;
    status: string;
    userId: bigint | null;
    phone: string | null;
    email: string | null;
    marketingConsent: boolean;
    version: bigint;
  }> {
    const branchIds = this.visibleBranchIds(actor);
    const customer = await this.prisma.customer.findFirst({
      where: { id: toDatabaseId(id), ...this.customerScopeWhere(branchIds) },
      select: {
        id: true,
        status: true,
        userId: true,
        phone: true,
        email: true,
        marketingConsent: true,
        version: true,
      },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return customer;
  }

  /** Chuỗi rỗng nghĩa là xoá liên hệ; `undefined` nghĩa là không đụng tới. */
  private normalizePhone(raw: string | undefined) {
    const value = raw?.trim();
    if (!value) return null;
    try {
      return { value, normalized: normalizeVietnamesePhone(value) };
    } catch {
      throw new BadRequestException('Số điện thoại không hợp lệ');
    }
  }

  private normalizeEmail(raw: string | undefined) {
    const value = raw?.trim();
    if (!value) return null;
    return { value, normalized: value.toLowerCase() };
  }

  /**
   * INVARIANT: một số điện thoại/email chỉ thuộc về một hồ sơ khách. Trùng nghĩa là lịch sử mua
   * hàng của cùng một người bị tách làm hai, và lần sau tra bảo hành sẽ thiếu.
   */
  private async assertContactNotTaken(
    phone: { normalized: string } | null | undefined,
    email: { normalized: string } | null | undefined,
    exceptId?: bigint,
  ): Promise<void> {
    const conditions: Prisma.CustomerWhereInput[] = [];
    if (phone) conditions.push({ normalizedPhone: phone.normalized });
    if (email) conditions.push({ normalizedEmail: email.normalized });
    if (conditions.length === 0) return;

    const existing = await this.prisma.customer.findFirst({
      where: { OR: conditions, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { normalizedPhone: true, normalizedEmail: true },
    });
    if (!existing) return;
    throw new ConflictException(
      existing.normalizedPhone === phone?.normalized
        ? 'Số điện thoại đã thuộc về một khách hàng khác'
        : 'Email đã thuộc về một khách hàng khác',
    );
  }

  /**
   * Ảnh đại diện phải là media asset còn dùng được. Nhận id rác sẽ tạo hồ sơ trỏ vào ảnh không
   * tồn tại và màn danh sách hiển thị ô ảnh vỡ mà không ai biết tại sao.
   */
  private async resolveAvatarAssetId(raw: string | undefined): Promise<bigint | undefined> {
    if (raw === undefined) return undefined;
    const id = toDatabaseId(raw);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!asset) throw new BadRequestException('Ảnh đại diện không tồn tại hoặc đã bị xoá');
    return asset.id;
  }

  /**
   * INVARIANT: mỗi khách có đúng một địa chỉ mặc định. Không ai đánh dấu thì địa chỉ đầu tiên
   * được chọn, vì luồng tạo đơn luôn cần một địa chỉ giao mặc định để điền sẵn.
   */
  private validateAddressInput(
    addresses: AdminCustomerAddressInputDto[] | undefined,
  ): AdminCustomerAddressInputDto[] | undefined {
    if (addresses === undefined) return undefined;
    const defaults = addresses.filter((address) => address.isDefault === true);
    if (defaults.length > 1) {
      throw new BadRequestException('Chỉ được chọn một địa chỉ mặc định');
    }
    const ids = addresses.flatMap((address) => (address.id ? [address.id] : []));
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Một địa chỉ xuất hiện nhiều lần trong danh sách');
    }
    return addresses.map((address, index) => ({
      ...address,
      isDefault: defaults.length === 0 ? index === 0 : address.isDefault === true,
    }));
  }

  /**
   * Đồng bộ danh sách địa chỉ về đúng trạng thái client gửi lên.
   *
   * Địa chỉ bỏ đi được chuyển INACTIVE chứ không xoá cứng: đơn hàng cũ vẫn tham chiếu địa chỉ giao
   * tại thời điểm đặt, xoá cứng thì tra lại lịch sử giao hàng sẽ mất gốc.
   */
  private async syncAddresses(
    transaction: Prisma.TransactionClient,
    customerId: bigint,
    addresses: AdminCustomerAddressInputDto[],
  ): Promise<void> {
    const existing = await transaction.customerAddress.findMany({
      where: { customerId, status: CUSTOMER_STATUS.ACTIVE },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((row) => row.id.toString()));
    const keptIds = new Set<string>();

    for (const address of addresses) {
      const data = {
        recipient: address.recipient.trim(),
        phone: this.normalizeAddressPhone(address.phone),
        addressLine: address.addressLine.trim(),
        ward: address.ward?.trim() || null,
        district: address.district?.trim() || null,
        provinceCode: address.provinceCode.trim(),
        isDefault: address.isDefault === true,
      };
      if (address.id) {
        // Địa chỉ của khách khác không được kéo sang hồ sơ này chỉ vì client gửi kèm id.
        if (!existingIds.has(toDatabaseId(address.id).toString())) {
          throw new BadRequestException('Địa chỉ không thuộc về khách hàng này');
        }
        const id = toDatabaseId(address.id);
        keptIds.add(id.toString());
        await transaction.customerAddress.update({
          where: { id },
          data: { ...data, version: { increment: 1 } },
        });
        continue;
      }
      await transaction.customerAddress.create({
        data: {
          ...data,
          customerId,
          addressType: CUSTOMER_ADDRESS_TYPE.SHIPPING,
          countryCode: CUSTOMER_COUNTRY.VIETNAM,
        },
      });
    }

    const removedIds = [...existingIds].filter((id) => !keptIds.has(id)).map((id) => BigInt(id));
    if (removedIds.length > 0) {
      await transaction.customerAddress.updateMany({
        where: { id: { in: removedIds } },
        data: { status: CUSTOMER_STATUS.INACTIVE, isDefault: false, version: { increment: 1 } },
      });
    }
  }

  private normalizeAddressPhone(value: string): string {
    try {
      return normalizeVietnamesePhone(value);
    } catch {
      throw new BadRequestException('Số điện thoại người nhận không hợp lệ');
    }
  }

  /**
   * Số đơn, giá trị vòng đời và lần mua gần nhất cho cả trang trong một lượt truy vấn.
   * Tính từng khách một sẽ là N lượt đi database, mỗi lượt ~450ms trên đường truyền hiện tại.
   */
  private async orderRollups(
    customerIds: bigint[],
    branchIds: bigint[] | undefined,
  ): Promise<Map<string, OrderRollup>> {
    if (customerIds.length === 0) return new Map();

    // Số đơn và số tiền đã chi cũng phải nằm trong phạm vi chi nhánh: nếu không, nhân viên
    // một chi nhánh suy ra được doanh số của chi nhánh khác qua tổng chi tiêu của khách.
    const branchFilter = branchIds
      ? Prisma.sql`AND o.branch_id IN (${Prisma.join(branchIds)})`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{ customer_id: bigint; order_count: number; lifetime_value: Prisma.Decimal | null; last_order_at: Date | null }>
    >`
      SELECT
        o.customer_id,
        COUNT(*) FILTER (WHERE o.status <> ${CANCELLED_STATUS})::int AS order_count,
        COALESCE(
          SUM(o.grand_total) FILTER (WHERE o.payment_status = ${PAID_STATUS} AND o.status <> ${CANCELLED_STATUS}),
          0
        ) AS lifetime_value,
        MAX(o.placed_at) FILTER (WHERE o.status <> ${CANCELLED_STATUS}) AS last_order_at
      FROM public.orders o
      WHERE o.customer_id IN (${Prisma.join(customerIds)})
        ${branchFilter}
      GROUP BY o.customer_id
    `;

    return new Map(
      rows.map((row) => [
        row.customer_id.toString(),
        {
          orderCount: row.order_count,
          lifetimeValue: new Prisma.Decimal(row.lifetime_value ?? 0),
          lastOrderAt: row.last_order_at,
        },
      ]),
    );
  }

  private toSummary(
    row: {
      id: bigint;
      customerNo: string;
      name: string;
      email: string | null;
      phone: string | null;
      status: string;
      userId: bigint | null;
      marketingConsent: boolean;
      avatarAssetId: bigint | null;
      avatarAsset?: { secureUrl: string; thumbnailUrl: string | null } | null;
      createdAt: Date;
      version: bigint;
    },
    rollup: OrderRollup | undefined,
  ): AdminCustomerSummaryDto {
    const kind: CustomerKind = row.userId === null ? 'GUEST' : 'MEMBER';
    return {
      id: toEntityId(row.id),
      customerNo: row.customerNo,
      name: row.name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      kind,
      marketingConsent: row.marketingConsent,
      avatarAssetId: row.avatarAssetId === null ? null : toEntityId(row.avatarAssetId),
      // Danh sách không join media asset để tránh N+1; ở đó chỉ có id, URL chỉ có ở màn chi tiết.
      avatarUrl: row.avatarAsset?.thumbnailUrl ?? row.avatarAsset?.secureUrl ?? null,
      orderCount: rollup?.orderCount ?? 0,
      lifetimeValue: (rollup?.lifetimeValue ?? new Prisma.Decimal(0)).toFixed(2),
      lastOrderAt: rollup?.lastOrderAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      version: Number(row.version),
    };
  }
}
