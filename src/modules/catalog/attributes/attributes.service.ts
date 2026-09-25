import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toDatabaseId, toEntityId } from '../../../common/identifiers/entity-id';
import { MutationContext } from '../../../common/request/request-context';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import {
  ATTRIBUTE_AUDIT_ACTION,
  ATTRIBUTE_DATA_TYPE,
  ATTRIBUTE_ERROR_CODE,
  ATTRIBUTE_LIMIT,
  ATTRIBUTE_STATUS,
  type AttributeDataType,
  type AttributeStatus,
} from './attribute.constants';
import type {
  AttributeDto,
  AttributeListDto,
  AttributeOptionDto,
  CreateAttributeDto,
  ProductSpecificationDto,
  ProductSpecificationInputDto,
  UpdateAttributeDto,
} from './attribute.dto';

type AttributeRow = Prisma.AttributeGetPayload<Record<string, never>>;
export type StoredSpecification = { code: string; values: Array<string | number | boolean> };

/**
 * Từ điển thuộc tính và kiểm tra thông số sản phẩm (decision D61).
 *
 * INVARIANT: `products.specifications` tham chiếu theo `attributes.code` mà không có FK, nên service này
 * là chốt chặn duy nhất: code bất biến, không xoá cứng, không đổi kiểu/đơn vị hay bỏ lựa chọn khi đã có
 * sản phẩm dùng, và mọi lần ghi thông số phải qua `validateSpecifications`.
 */
@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
  ) {}

  async list(): Promise<AttributeListDto> {
    const rows = await this.prisma.attribute.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
    return { items: rows.map((row) => this.toDto(row)) };
  }

  async create(input: CreateAttributeDto, context: MutationContext): Promise<AttributeDto> {
    const options = this.normalizeOptions(input.dataType, input.options);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const row = await transaction.attribute.create({
          data: {
            code: input.code,
            name: input.name,
            dataType: input.dataType,
            unit: input.unit || null,
            isVariantAxis: input.isVariantAxis ?? false,
            options: options ? (options as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            sortOrder: input.sortOrder ?? 0,
          },
        });
        await this.writeAudit(transaction, context, ATTRIBUTE_AUDIT_ACTION.CREATE, row.id, undefined, this.snapshot(row));
        return this.toDto(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Attribute code already exists');
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateAttributeDto, context: MutationContext): Promise<AttributeDto> {
    const databaseId = toDatabaseId(id);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM attributes WHERE id = ${databaseId} FOR UPDATE`;
      const current = await transaction.attribute.findUnique({ where: { id: databaseId } });
      if (!current) throw new NotFoundException('Attribute not found');
      if (Number(current.version) !== input.expectedVersion) {
        throw new ConflictException({ code: ATTRIBUTE_ERROR_CODE.VERSION_CONFLICT, message: 'Attribute changed; reload and retry' });
      }
      const dataType = current.dataType as AttributeDataType;
      const nextUnit = input.unit === undefined ? current.unit : input.unit || null;
      const nextOptions = input.options === undefined ? undefined : this.normalizeOptions(dataType, input.options);

      // INVARIANT: đổi đơn vị của thuộc tính NUMBER đang dùng sẽ đổi nghĩa mọi số đã lưu (2.25 m → 2.25 cm).
      if (nextUnit !== current.unit && dataType === ATTRIBUTE_DATA_TYPE.NUMBER && (await this.isUsed(transaction, current.code))) {
        throw new ConflictException({ code: ATTRIBUTE_ERROR_CODE.IN_USE, message: 'Cannot change the unit of an attribute already used by products' });
      }
      // INVARIANT: bỏ một lựa chọn đang được sản phẩm dùng sẽ để lại mã không còn nhãn.
      if (nextOptions) {
        const kept = new Set(nextOptions.map(({ code }) => code));
        for (const removed of this.readOptions(current).filter(({ code }) => !kept.has(code))) {
          if (await this.isUsed(transaction, current.code, removed.code)) {
            throw new ConflictException({ code: ATTRIBUTE_ERROR_CODE.IN_USE, message: `Option ${removed.code} is used by products and cannot be removed` });
          }
        }
      }

      const updated = await transaction.attribute.update({
        where: { id: databaseId },
        data: {
          name: input.name,
          unit: nextUnit,
          isVariantAxis: input.isVariantAxis,
          ...(nextOptions ? { options: nextOptions as unknown as Prisma.InputJsonValue } : {}),
          status: input.status,
          sortOrder: input.sortOrder,
          version: { increment: 1 },
        },
      });
      await this.writeAudit(transaction, context, ATTRIBUTE_AUDIT_ACTION.UPDATE, updated.id, this.snapshot(current), this.snapshot(updated));
      return this.toDto(updated);
    });
  }

  /**
   * Kiểm và chuẩn hoá thông số trước khi ghi `products.specifications`.
   *
   * Thuộc tính INACTIVE chỉ được giữ nguyên giá trị đang có (để sửa thông số khác không bị chặn), không
   * được thêm mới hay đổi giá trị. Trả về đúng dạng lưu: chỉ `code` + `values`, không nhãn/đơn vị.
   */
  async validateSpecifications(
    client: Prisma.TransactionClient | PrismaService,
    input: ProductSpecificationInputDto[],
    current: StoredSpecification[],
  ): Promise<StoredSpecification[]> {
    const codes = input.map(({ code }) => code);
    if (new Set(codes).size !== codes.length) throw this.invalid('Each attribute can appear only once');
    const attributes = new Map(
      (await client.attribute.findMany({ where: { code: { in: codes } } })).map((row) => [row.code, row]),
    );
    const currentByCode = new Map(current.map((entry) => [entry.code, JSON.stringify(entry.values)]));

    return input.map(({ code, values }) => {
      const attribute = attributes.get(code);
      if (!attribute) throw this.invalid(`Unknown attribute ${code}`);
      const normalized = this.normalizeValues(attribute, values);
      if (attribute.status !== ATTRIBUTE_STATUS.ACTIVE && currentByCode.get(code) !== JSON.stringify(normalized)) {
        throw this.invalid(`Attribute ${code} is inactive`);
      }
      return { code, values: normalized };
    });
  }

  /** Ghép nhãn/đơn vị từ từ điển để FE render; thuộc tính INACTIVE vẫn hiển thị cho dữ liệu cũ. */
  async resolve(stored: unknown): Promise<ProductSpecificationDto[]> {
    const entries = this.readStored(stored);
    if (entries.length === 0) return [];
    const attributes = await this.prisma.attribute.findMany({ where: { code: { in: entries.map(({ code }) => code) } } });
    const byCode = new Map(attributes.map((row) => [row.code, row]));
    return entries
      .flatMap((entry) => {
        const attribute = byCode.get(entry.code);
        return attribute ? [{ entry, attribute }] : [];
      })
      .sort((left, right) => left.attribute.sortOrder - right.attribute.sortOrder || left.attribute.code.localeCompare(right.attribute.code))
      .map(({ entry, attribute }) => {
        const options = new Map(this.readOptions(attribute).map((option) => [option.code, option.label]));
        return {
          code: attribute.code,
          name: attribute.name,
          dataType: attribute.dataType as AttributeDataType,
          unit: attribute.unit,
          values: entry.values.map((value) => ({ value, label: this.label(attribute, value, options) })),
        };
      });
  }

  readStored(value: unknown): StoredSpecification[] {
    return Array.isArray(value)
      ? (value as StoredSpecification[]).filter((entry) => typeof entry?.code === 'string' && Array.isArray(entry.values))
      : [];
  }

  private normalizeValues(attribute: AttributeRow, values: Array<string | number | boolean>): Array<string | number | boolean> {
    if (values.length === 0) throw this.invalid(`${attribute.code} needs at least one value`);
    let normalized: Array<string | number | boolean>;
    switch (attribute.dataType as AttributeDataType) {
      case ATTRIBUTE_DATA_TYPE.TEXT:
        normalized = values.map((value) => {
          const text = typeof value === 'string' ? value.trim() : '';
          if (!text || text.length > ATTRIBUTE_LIMIT.MAX_TEXT_LENGTH) throw this.invalid(`${attribute.code} expects text up to 255 characters`);
          return text;
        });
        break;
      case ATTRIBUTE_DATA_TYPE.NUMBER:
        normalized = values.map((value) => {
          if (typeof value !== 'number' || !Number.isFinite(value)) throw this.invalid(`${attribute.code} expects numbers`);
          return value;
        });
        break;
      case ATTRIBUTE_DATA_TYPE.BOOLEAN:
        if (values.length !== 1 || typeof values[0] !== 'boolean') throw this.invalid(`${attribute.code} expects a single true/false`);
        normalized = values;
        break;
      case ATTRIBUTE_DATA_TYPE.OPTION: {
        const allowed = new Set(this.readOptions(attribute).map(({ code }) => code));
        normalized = values.map((value) => {
          const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
          if (!allowed.has(code)) throw this.invalid(`${attribute.code} has no option ${String(value)}`);
          return code;
        });
        break;
      }
      default:
        throw this.invalid(`${attribute.code} has an unsupported data type`);
    }
    if (new Set(normalized.map(String)).size !== normalized.length) throw this.invalid(`${attribute.code} has duplicated values`);
    return normalized;
  }

  private normalizeOptions(dataType: AttributeDataType, options?: AttributeOptionDto[]): AttributeOptionDto[] | undefined {
    if (dataType !== ATTRIBUTE_DATA_TYPE.OPTION) {
      if (options?.length) throw new UnprocessableEntityException('Only OPTION attributes can have options');
      return undefined;
    }
    if (!options?.length) throw new UnprocessableEntityException('OPTION attribute needs at least one option');
    if (new Set(options.map(({ code }) => code)).size !== options.length) {
      throw new UnprocessableEntityException('Option codes must be unique');
    }
    return options.map(({ code, label, colorHex }) => ({ code, label, colorHex: colorHex ?? null }));
  }

  /** Có sản phẩm nào đang dùng thuộc tính (và lựa chọn, nếu truyền) không — dùng toán tử chứa của JSONB. */
  private async isUsed(client: Prisma.TransactionClient, code: string, optionCode?: string): Promise<boolean> {
    const probe = JSON.stringify([optionCode ? { code, values: [optionCode] } : { code }]);
    const rows = await client.$queryRaw<Array<{ one: number }>>`
      SELECT 1 AS one FROM products WHERE specifications @> ${probe}::jsonb LIMIT 1`;
    return rows.length > 0;
  }

  private readOptions(attribute: Pick<AttributeRow, 'options'>): AttributeOptionDto[] {
    return Array.isArray(attribute.options) ? (attribute.options as unknown as AttributeOptionDto[]) : [];
  }

  private label(attribute: AttributeRow, value: string | number | boolean, options: Map<string, string>): string {
    if (typeof value === 'boolean') return value ? 'Có' : 'Không';
    if (attribute.dataType === ATTRIBUTE_DATA_TYPE.OPTION) return options.get(String(value)) ?? String(value);
    if (typeof value === 'number') {
      const text = value.toLocaleString('vi-VN', { maximumFractionDigits: 4 });
      return attribute.unit ? `${text} ${attribute.unit}` : text;
    }
    return value;
  }

  private invalid(message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ code: ATTRIBUTE_ERROR_CODE.INVALID_SPECIFICATION, message });
  }

  private toDto(row: AttributeRow): AttributeDto {
    return {
      id: toEntityId(row.id),
      code: row.code,
      name: row.name,
      dataType: row.dataType as AttributeDataType,
      unit: row.unit,
      isVariantAxis: row.isVariantAxis,
      options: this.readOptions(row),
      status: row.status as AttributeStatus,
      sortOrder: row.sortOrder,
      version: Number(row.version),
    };
  }

  private snapshot(row: AttributeRow): Prisma.InputJsonValue {
    return { ...this.toDto(row), options: this.readOptions(row) } as unknown as Prisma.InputJsonValue;
  }

  private writeAudit(
    transaction: Prisma.TransactionClient,
    context: MutationContext,
    action: string,
    id: bigint,
    before?: Prisma.InputJsonValue,
    after?: Prisma.InputJsonValue,
  ) {
    return this.audit.write(
      {
        requestId: context.requestId,
        sequenceNo: 1,
        actorType: 'USER',
        actorUserId: context.actorUserId,
        action,
        entityType: 'ATTRIBUTE',
        entityId: toEntityId(id),
        before,
        after,
      },
      transaction,
    );
  }
}
