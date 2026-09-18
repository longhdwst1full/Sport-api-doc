import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toActorDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { MutationContext } from '../../../common/request/request-context';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import {
  SYSTEM_PARAMETER_CATALOG,
  SYSTEM_PARAMETER_VALUE_TYPE,
  type SystemParameterCode,
  type SystemParameterDefinition,
  type SystemParameterValueType,
} from './system-parameter.catalog';
import {
  PARAMETER_STATUS,
  CreateSystemParameterDto,
  DeleteSystemParameterDto,
  SystemParameterDto,
  SystemParameterListDto,
  SystemParameterQueryDto,
  UpdateSystemParameterDto,
} from './system-parameter.dto';

/**
 * Cache trong tiến trình để mỗi lần báo giá không phải đọc lại database.
 * TTL ngắn nên thay đổi từ Admin có hiệu lực gần như ngay; cache cũng bị xoá
 * tường minh sau mỗi lần cập nhật để lần đọc kế tiếp chắc chắn thấy giá trị mới.
 */
const CACHE_TTL_MS = 30_000;

/** Thay cho giá trị bí mật khi trả ra API: chỉ nói đã cấu hình, không nói cấu hình bằng gì. */
const SECRET_MASK = '••••••••';

const definitionByCode = new Map<string, SystemParameterDefinition>(
  SYSTEM_PARAMETER_CATALOG.map((definition) => [definition.code, definition]),
);

@Injectable()
export class SystemParameterService implements OnModuleInit {
  private readonly logger = new Logger(SystemParameterService.name);

  private cache = new Map<string, string>();
  private cacheExpiresAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Đồng bộ catalog vào database ngay khi khởi động.
   *
   * Tham số là dữ liệu tham chiếu, không phải dữ liệu vận hành nhập tay, nên để
   * code là nguồn định nghĩa và database là nơi lưu giá trị. Không dùng script
   * seed riêng vì dễ quên chạy sau khi thêm tham số mới; lỗi ở bước này chỉ ghi
   * log chứ không chặn ứng dụng khởi động.
   */
  async onModuleInit(): Promise<void> {
    try {
      const created = await this.syncCatalog();
      if (created > 0) this.logger.log(`Đã tạo ${created} tham số hệ thống từ catalog`);
    } catch (error) {
      this.logger.warn(
        `Không đồng bộ được catalog tham số: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
      );
    }
  }

  /**
   * Đọc số nguyên theo mã tham số.
   *
   * Không có bản ghi, giá trị hỏng hoặc database chưa bật thì rơi về
   * `defaultValue` trong catalog — cấu hình sai không được làm sập luồng bán hàng.
   */
  async getInteger(code: SystemParameterCode): Promise<number> {
    const definition = this.requireDefinition(code);
    const raw = await this.readValue(code);
    const parsed = Number(raw ?? definition.defaultValue);
    if (!Number.isFinite(parsed)) return Number(definition.defaultValue);
    return Math.trunc(parsed);
  }

  async getBoolean(code: SystemParameterCode): Promise<boolean> {
    const definition = this.requireDefinition(code);
    const raw = (await this.readValue(code)) ?? definition.defaultValue;
    return raw === 'true';
  }

  async getString(code: SystemParameterCode): Promise<string> {
    const definition = this.requireDefinition(code);
    return (await this.readValue(code)) ?? definition.defaultValue;
  }

  /**
   * Tham số công khai cho Storefront (ví dụ biểu phí giao hàng hiển thị ở trang
   * chính sách). Chỉ trả bản ghi bật `isPublic` — mặc định mọi tham số đều riêng tư.
   */
  async listPublic(): Promise<SystemParameterListDto> {
    if (!this.prisma.isEnabled()) return { items: [], page: 1, limit: 0, total: 0 };
    const rows = await this.prisma.systemParameter.findMany({
      where: { isPublic: true, status: PARAMETER_STATUS.ACTIVE },
      orderBy: [{ groupCode: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    const items = rows.map((row) => this.toDto(row));
    return { items, page: 1, limit: items.length, total: items.length };
  }

  /**
   * Danh sách có phân trang, lọc và sắp xếp — kế thừa `ParameterResource` của
   * fund-ops-service (`page`/`size`/`sort`, lọc theo nhóm, tên và trạng thái).
   *
   * Trường sắp xếp đi qua whitelist `SYSTEM_PARAMETER_SORT_FIELD`; nhận chuỗi tuỳ
   * ý từ query rồi ghép thẳng vào `orderBy` là mở đường cho truy vấn ngoài ý muốn.
   */
  async list(query: SystemParameterQueryDto): Promise<SystemParameterListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (!this.prisma.isEnabled()) return { items: [], page, limit, total: 0 };

    const filters: Prisma.SystemParameterWhereInput[] = [];
    if (query.groupCode) filters.push({ groupCode: query.groupCode });
    if (query.status) filters.push({ status: query.status });
    if (query.isSystem !== undefined) filters.push({ isSystem: query.isSystem });
    if (query.search) {
      filters.push({
        OR: [
          { code: { contains: query.search, mode: 'insensitive' } },
          { label: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.SystemParameterWhereInput = filters.length ? { AND: filters } : {};

    const sortField = query.sortBy ?? 'sortOrder';
    const direction = query.sortDirection ?? 'asc';
    const orderBy: Prisma.SystemParameterOrderByWithRelationInput[] =
      sortField === 'sortOrder'
        ? [{ groupCode: 'asc' }, { sortOrder: direction }, { id: 'asc' }]
        : [{ [sortField]: direction } as Prisma.SystemParameterOrderByWithRelationInput, { id: 'desc' }];

    const [rows, total] = await Promise.all([
      this.prisma.systemParameter.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.systemParameter.count({ where }),
    ]);
    return { items: rows.map((row) => this.toDto(row)), page, limit, total };
  }

  async update(
    code: string,
    input: UpdateSystemParameterDto,
    context: MutationContext,
  ): Promise<SystemParameterDto> {
    const definition = this.requireDefinition(code as SystemParameterCode);
    // Kiểm tra kiểu và khoảng TRƯỚC khi mở transaction: payload sai không có lý do
    // gì phải chiếm một transaction, và như vậy mới test được mà không cần database.
    this.assertValidValue(definition, input.value);

    const updated = await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.systemParameter.findUnique({ where: { code } });
      if (!current) throw new NotFoundException('Không tìm thấy tham số hệ thống');
      if (current.version !== BigInt(input.expectedVersion)) {
        throw new ConflictException('Tham số đã thay đổi; vui lòng tải lại trước khi lưu');
      }

      // Gửi lại đúng dấu che nghĩa là người dùng không sửa ô bí mật; giữ nguyên giá trị cũ thay
      // vì ghi chuỗi dấu chấm vào làm token.
      const nextValue = current.isSecret && input.value === SECRET_MASK ? current.value : input.value;

      const row = await transaction.systemParameter.update({
        where: { code },
        data: {
          value: nextValue,
          remarks: input.reason?.trim() || null,
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
          action: 'system.parameter.update',
          entityType: 'SYSTEM_PARAMETER',
          entityId: toEntityId(row.id),
          // SECURITY: audit không lưu giá trị bí mật. Ghi lại chỉ để biết AI đổi và ĐỔI LÚC NÀO;
          // chép token vào audit là nhân bản bí mật sang một bảng giữ 10 năm.
          before: { value: current.isSecret ? SECRET_MASK : current.value },
          after: { value: row.isSecret ? SECRET_MASK : row.value },
          ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        },
        transaction,
      );
      return row;
    });

    // Xoá cache ngay để không phải chờ hết TTL mới thấy giá trị mới.
    this.invalidateCache();
    return this.toDto(updated);
  }

  /**
   * Tạo tham số tuỳ biến từ Admin.
   *
   * Tham số tạo kiểu này có `isSystem = false`: code không tham chiếu tới nó, nên
   * nó chỉ là chỗ lưu giá trị vận hành. Không cho trùng mã với catalog hệ thống
   * để tránh tình huống hai nguồn cùng một mã.
   */
  async create(input: CreateSystemParameterDto, context: MutationContext): Promise<SystemParameterDto> {
    if (definitionByCode.has(input.code)) {
      throw new ConflictException(
        `Mã ${input.code} là tham số hệ thống, không tạo trùng. Hãy sửa giá trị của bản ghi sẵn có.`,
      );
    }
    if (input.minValue !== undefined && input.maxValue !== undefined && input.maxValue < input.minValue) {
      throw new BadRequestException('Giá trị lớn nhất phải không nhỏ hơn giá trị nhỏ nhất');
    }
    this.assertValidValue(
      {
        code: input.code as SystemParameterCode,
        groupCode: input.groupCode,
        label: input.label,
        description: input.description ?? '',
        valueType: input.valueType as SystemParameterValueType,
        defaultValue: input.value,
        minValue: input.minValue,
        maxValue: input.maxValue,
        sortOrder: 0,
      },
      input.value,
    );

    const created = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.systemParameter.findUnique({ where: { code: input.code } });
      if (existing) throw new ConflictException('Mã tham số đã tồn tại');
      const row = await transaction.systemParameter.create({
        data: {
          code: input.code,
          groupCode: input.groupCode,
          label: input.label,
          description: input.description ?? null,
          valueType: input.valueType,
          value: input.value,
          defaultValue: input.value,
          minValue: input.minValue === undefined ? null : new Prisma.Decimal(input.minValue),
          maxValue: input.maxValue === undefined ? null : new Prisma.Decimal(input.maxValue),
          unit: input.unit ?? null,
          isPublic: input.isPublic ?? false,
          isSystem: false,
          remarks: input.remarks ?? null,
          createdBy: toActorDatabaseId(context.actorUserId),
          updatedBy: toActorDatabaseId(context.actorUserId),
        },
      });
      await this.audit.write(
        {
          requestId: context.requestId,
          sequenceNo: 1,
          actorType: 'USER',
          actorUserId: context.actorUserId,
          action: 'system.parameter.create',
          entityType: 'SYSTEM_PARAMETER',
          entityId: toEntityId(row.id),
          after: input as unknown as Prisma.InputJsonValue,
        },
        transaction,
      );
      return row;
    });

    this.invalidateCache();
    return this.toDto(created);
  }

  /** Xoá tham số tuỳ biến. Tham số hệ thống không xoá được vì code đang đọc theo mã. */
  async remove(code: string, input: DeleteSystemParameterDto, context: MutationContext): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.systemParameter.findUnique({ where: { code } });
      if (!current) throw new NotFoundException('Không tìm thấy tham số hệ thống');
      if (current.isSystem) {
        throw new ConflictException(
          'Tham số hệ thống đang được code sử dụng, không xoá được. Chỉ sửa được giá trị.',
        );
      }
      if (current.version !== BigInt(input.expectedVersion)) {
        throw new ConflictException('Tham số đã thay đổi; vui lòng tải lại trước khi xoá');
      }
      // Xoá mềm: quy ước V1 là không physical delete với dữ liệu có lịch sử thay
      // đổi. Bản ghi INACTIVE không còn được đọc nhưng vết audit vẫn tra ngược được.
      await transaction.systemParameter.update({
        where: { code },
        data: {
          status: PARAMETER_STATUS.INACTIVE,
          remarks: input.reason?.trim() || null,
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
          action: 'system.parameter.deactivate',
          entityType: 'SYSTEM_PARAMETER',
          entityId: toEntityId(current.id),
          before: { code: current.code, value: current.value },
          ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        },
        transaction,
      );
    });
    this.invalidateCache();
  }

  private invalidateCache(): void {
    this.cache.clear();
    this.cacheExpiresAt = 0;
  }

  /** Đồng bộ catalog vào database: thêm tham số mới, không ghi đè giá trị đang dùng. */
  async syncCatalog(): Promise<number> {
    if (!this.prisma.isEnabled()) return 0;
    let created = 0;
    for (const definition of SYSTEM_PARAMETER_CATALOG) {
      const existing = await this.prisma.systemParameter.findUnique({
        where: { code: definition.code },
      });
      if (existing) {
        // Metadata mô tả có thể cập nhật; `value` do vận hành sở hữu nên giữ nguyên.
        await this.prisma.systemParameter.update({
          where: { code: definition.code },
          data: {
            groupCode: definition.groupCode,
            label: definition.label,
            description: definition.description,
            valueType: definition.valueType,
            defaultValue: definition.defaultValue,
            minValue: definition.minValue === undefined ? null : new Prisma.Decimal(definition.minValue),
            maxValue: definition.maxValue === undefined ? null : new Prisma.Decimal(definition.maxValue),
            unit: definition.unit ?? null,
            sortOrder: definition.sortOrder,
            isPublic: definition.isPublic ?? false,
            isSecret: definition.isSecret ?? false,
            isSystem: true,
          },
        });
        continue;
      }
      await this.prisma.systemParameter.create({
        data: {
          code: definition.code,
          groupCode: definition.groupCode,
          label: definition.label,
          description: definition.description,
          valueType: definition.valueType,
          value: definition.defaultValue,
          defaultValue: definition.defaultValue,
          minValue: definition.minValue === undefined ? null : new Prisma.Decimal(definition.minValue),
          maxValue: definition.maxValue === undefined ? null : new Prisma.Decimal(definition.maxValue),
          unit: definition.unit ?? null,
          sortOrder: definition.sortOrder,
          isPublic: definition.isPublic ?? false,
          isSecret: definition.isSecret ?? false,
          isSystem: true,
        },
      });
      created += 1;
    }
    this.invalidateCache();
    return created;
  }

  private async readValue(code: string): Promise<string | undefined> {
    const stored = this.prisma.isEnabled() ? await this.readStoredValue(code) : undefined;
    if (stored !== undefined && stored !== '') return stored;
    // Tham số để trống nghĩa là chưa cấu hình qua Admin: rơi về biến môi trường để môi trường
    // mới chạy được ngay, và để database hỏng không kéo theo mất toàn bộ cấu hình tích hợp.
    const envName = definitionByCode.get(code as SystemParameterCode)?.envFallback;
    const fromEnv = envName ? process.env[envName]?.trim() : undefined;
    return fromEnv || stored;
  }

  private async readStoredValue(code: string): Promise<string | undefined> {
    const now = Date.now();
    if (now > this.cacheExpiresAt) {
      const rows = await this.prisma.systemParameter.findMany({
        where: { status: PARAMETER_STATUS.ACTIVE },
      });
      this.cache = new Map(rows.map((row) => [row.code, row.value]));
      this.cacheExpiresAt = now + CACHE_TTL_MS;
    }
    return this.cache.get(code);
  }

  private requireDefinition(code: SystemParameterCode): SystemParameterDefinition {
    const definition = definitionByCode.get(code);
    if (!definition) throw new NotFoundException(`Tham số ${code} không có trong danh mục`);
    return definition;
  }

  private assertValidValue(definition: SystemParameterDefinition, value: string): void {
    if (definition.valueType === SYSTEM_PARAMETER_VALUE_TYPE.BOOLEAN) {
      if (value !== 'true' && value !== 'false') {
        throw new BadRequestException('Giá trị phải là true hoặc false');
      }
      return;
    }
    if (definition.valueType === SYSTEM_PARAMETER_VALUE_TYPE.STRING) {
      if (!value.trim()) throw new BadRequestException('Giá trị không được để trống');
      return;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new BadRequestException('Giá trị phải là số');
    if (definition.valueType === SYSTEM_PARAMETER_VALUE_TYPE.INTEGER && !Number.isInteger(parsed)) {
      throw new BadRequestException('Giá trị phải là số nguyên');
    }
    if (definition.minValue !== undefined && parsed < definition.minValue) {
      throw new BadRequestException(`Giá trị phải từ ${definition.minValue} trở lên`);
    }
    if (definition.maxValue !== undefined && parsed > definition.maxValue) {
      throw new BadRequestException(`Giá trị không được vượt quá ${definition.maxValue}`);
    }
  }

  private toDto(row: {
    id: bigint; code: string; groupCode: string; label: string; description: string | null;
    valueType: string; value: string; defaultValue: string;
    minValue: Prisma.Decimal | null; maxValue: Prisma.Decimal | null;
    unit: string | null; status: string; isPublic: boolean; isSystem: boolean; isSecret: boolean;
    remarks: string | null;
    version: bigint; updatedAt: Date; updatedBy: bigint | null;
  }): SystemParameterDto {
    return {
      id: toEntityId(row.id),
      code: row.code,
      groupCode: row.groupCode,
      label: row.label,
      description: row.description,
      valueType: row.valueType,
      // SECURITY: bí mật nhà cung cấp chỉ ghi được, không đọc lại được. Trả giá trị thật ra đây
      // nghĩa là mọi tài khoản xem tham số đều cầm được khoá, và khoá nằm trong log của mọi
      // proxy giữa đường. Chỉ báo đã cấu hình hay chưa.
      value: row.isSecret ? (row.value ? SECRET_MASK : '') : row.value,
      defaultValue: row.isSecret ? '' : row.defaultValue,
      minValue: row.minValue ? row.minValue.toNumber() : null,
      maxValue: row.maxValue ? row.maxValue.toNumber() : null,
      unit: row.unit,
      status: row.status,
      isPublic: row.isPublic,
      isSystem: row.isSystem,
      isSecret: row.isSecret,
      remarks: row.remarks,
      version: row.version.toString(),
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy === null ? null : toEntityId(row.updatedBy),
    };
  }
}
