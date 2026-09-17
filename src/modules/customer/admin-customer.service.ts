import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { toDatabaseId, toEntityId } from '../../common/identifiers/entity-id';
import type { AuthPrincipal } from '../auth/auth.types';
import { ScopeType } from '../iam/iam.types';
import { normalizeVietnamesePhone } from '../auth/phone-normalization';
import { CUSTOMER_STATUS } from './customer.constants';
import {
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
  constructor(private readonly prisma: PrismaService) {}

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
  async create(input: CreateAdminCustomerDto): Promise<AdminCustomerDetailDto> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Tên khách hàng không được để trống');
    const phone = this.normalizePhone(input.phone);
    const email = this.normalizeEmail(input.email);
    if (!phone && !email) {
      throw new BadRequestException('Cần ít nhất số điện thoại hoặc email để nhận lại khách');
    }
    await this.assertContactNotTaken(phone, email);

    const created = await this.prisma.customer.create({
      data: {
        // Khách do Admin tạo không gắn với user nào, nên dùng mã ngẫu nhiên như khách vãng lai.
        customerNo: `CUS-A-${randomUUID().replaceAll('-', '').slice(0, 18).toUpperCase()}`,
        name,
        phone: phone?.value ?? null,
        normalizedPhone: phone?.normalized ?? null,
        email: email?.value ?? null,
        normalizedEmail: email?.normalized ?? null,
        marketingConsent: input.marketingConsent ?? false,
        status: CUSTOMER_STATUS.ACTIVE,
      },
      select: { id: true },
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
  ): Promise<AdminCustomerDetailDto> {
    const current = await this.loadInScope(id, actor);
    const phone = input.phone === undefined ? undefined : this.normalizePhone(input.phone);
    const email = input.email === undefined ? undefined : this.normalizeEmail(input.email);
    await this.assertContactNotTaken(phone, email, current.id);

    const changed = await this.prisma.customer.updateMany({
      where: { id: current.id, version: BigInt(input.expectedVersion) },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(phone !== undefined
          ? { phone: phone?.value ?? null, normalizedPhone: phone?.normalized ?? null }
          : {}),
        ...(email !== undefined
          ? { email: email?.value ?? null, normalizedEmail: email?.normalized ?? null }
          : {}),
        ...(input.marketingConsent !== undefined
          ? { marketingConsent: input.marketingConsent }
          : {}),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new ConflictException('Hồ sơ khách vừa thay đổi. Vui lòng tải lại rồi thử lại.');
    }
    return this.get(id, actor);
  }

  /** Ngừng hoạt động: giữ nguyên lịch sử mua hàng, chỉ chặn dùng tiếp hồ sơ này. */
  async deactivate(
    id: string,
    input: CustomerStatusCommandDto,
    actor: AuthPrincipal,
  ): Promise<AdminCustomerDetailDto> {
    return this.changeStatus(id, input, actor, CUSTOMER_STATUS.INACTIVE);
  }

  async activate(
    id: string,
    input: CustomerStatusCommandDto,
    actor: AuthPrincipal,
  ): Promise<AdminCustomerDetailDto> {
    return this.changeStatus(id, input, actor, CUSTOMER_STATUS.ACTIVE);
  }

  /**
   * Xoá hẳn hồ sơ khách.
   *
   * INVARIANT: chỉ xoá được khách chưa phát sinh đơn và không có tài khoản đăng nhập. Khách đã mua
   * hàng là một phần của lịch sử đơn — xoá đi thì báo cáo doanh thu và truy vết bảo hành mất gốc,
   * nên trường hợp đó phải dùng "Ngừng hoạt động".
   */
  async remove(id: string, input: CustomerStatusCommandDto, actor: AuthPrincipal): Promise<void> {
    const current = await this.loadInScope(id, actor);
    if (current.userId !== null) {
      throw new ConflictException(
        'Khách có tài khoản đăng nhập nên không xoá được. Hãy dùng Ngừng hoạt động.',
      );
    }
    const orderCount = await this.prisma.order.count({ where: { customerId: current.id } });
    if (orderCount > 0) {
      throw new ConflictException(
        'Khách đã có đơn hàng nên không xoá được. Hãy dùng Ngừng hoạt động.',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      const deleted = await transaction.customer.deleteMany({
        where: { id: current.id, version: BigInt(input.expectedVersion) },
      });
      if (deleted.count !== 1) {
        throw new ConflictException('Hồ sơ khách vừa thay đổi. Vui lòng tải lại rồi thử lại.');
      }
    });
  }

  private async changeStatus(
    id: string,
    input: CustomerStatusCommandDto,
    actor: AuthPrincipal,
    status: string,
  ): Promise<AdminCustomerDetailDto> {
    const current = await this.loadInScope(id, actor);
    if (current.status === status) {
      throw new ConflictException('Khách hàng đã ở trạng thái này');
    }
    const changed = await this.prisma.customer.updateMany({
      where: { id: current.id, version: BigInt(input.expectedVersion) },
      data: { status, version: { increment: 1 } },
    });
    if (changed.count !== 1) {
      throw new ConflictException('Hồ sơ khách vừa thay đổi. Vui lòng tải lại rồi thử lại.');
    }
    return this.get(id, actor);
  }

  private async loadInScope(
    id: string,
    actor: AuthPrincipal,
  ): Promise<{ id: bigint; status: string; userId: bigint | null }> {
    const branchIds = this.visibleBranchIds(actor);
    const customer = await this.prisma.customer.findFirst({
      where: { id: toDatabaseId(id), ...this.customerScopeWhere(branchIds) },
      select: { id: true, status: true, userId: true },
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
      orderCount: rollup?.orderCount ?? 0,
      lifetimeValue: (rollup?.lifetimeValue ?? new Prisma.Decimal(0)).toFixed(2),
      lastOrderAt: rollup?.lastOrderAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      version: Number(row.version),
    };
  }
}
