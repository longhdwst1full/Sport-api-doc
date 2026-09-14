import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Matches, ValidationOptions } from 'class-validator';

export const ENTITY_ID_PATTERN = /^[1-9]\d*$/;
export const ENTITY_ID_OPENAPI = {
  type: String,
  pattern: '^[1-9][0-9]*$',
  example: '1',
} as const;
export const ENTITY_REFERENCE_OPENAPI = {
  type: String,
  pattern: '^(?:[1-9][0-9]*|[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,})$',
  example: '1',
  description: 'Numeric entity ID, or a historical UUID retained by migrated audit/ledger data',
} as const;

export function IsEntityId(options?: ValidationOptions): PropertyDecorator {
  return Matches(ENTITY_ID_PATTERN, {
    message: 'Entity ID must be a positive decimal integer',
    ...options,
  });
}

export function toDatabaseId(value: string): bigint {
  const normalized = value.trim();
  if (!ENTITY_ID_PATTERN.test(normalized)) {
    throw new BadRequestException({
      code: 'INVALID_ENTITY_ID',
      message: 'Entity ID must be a positive decimal integer',
    });
  }
  return BigInt(normalized);
}

export function toOptionalDatabaseId(value: string | null | undefined): bigint | null | undefined {
  if (value === null) return null;
  return value === undefined ? undefined : toDatabaseId(value);
}

/**
 * ID người thực hiện để ghi vào cột `created_by`/`updated_by`.
 *
 * Khác `toOptionalDatabaseId`: actor không phải lúc nào cũng là một user trong
 * database — system principal của worker và principal giả lập khi bật
 * `AUTH_BYPASS` đều không có ID dạng số. Trong các trường hợp đó trả `undefined`
 * để cột FK bỏ trống, thay vì ném 400 và chặn cả nghiệp vụ hợp lệ.
 *
 * Chỉ dùng cho cột actor. ID nghiệp vụ vẫn phải qua `toDatabaseId` để sai định
 * dạng là bị chặn ngay.
 */
export function toActorDatabaseId(value: string | null | undefined): bigint | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = value.trim();
  return ENTITY_ID_PATTERN.test(normalized) ? BigInt(normalized) : undefined;
}

export function toEntityId(value: bigint | number | string): string {
  return String(value);
}

export function toOptionalEntityId(
  value: bigint | number | string | null | undefined,
): string | null | undefined {
  if (value === null) return null;
  return value === undefined ? undefined : toEntityId(value);
}

@Injectable()
export class ParseEntityIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    toDatabaseId(value);
    return value.trim();
  }
}
