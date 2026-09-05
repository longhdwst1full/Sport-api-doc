import { BadRequestException } from '@nestjs/common';
import { toDatabaseId, toEntityId, toOptionalDatabaseId } from './entity-id';

describe('entity ID boundary', () => {
  it('converts a positive decimal API ID into bigint and back without precision loss', () => {
    const publicId = '900719925474099312345';
    expect(toDatabaseId(publicId)).toBe(900719925474099312345n);
    expect(toEntityId(toDatabaseId(publicId))).toBe(publicId);
  });

  it.each(['', '0', '-1', '1.5', '01', '550e8400-e29b-41d4-a716-446655440000'])(
    'rejects invalid public ID %p',
    (value) => expect(() => toDatabaseId(value)).toThrow(BadRequestException),
  );

  it('keeps omitted and nullable foreign keys distinct', () => {
    expect(toOptionalDatabaseId(undefined)).toBeUndefined();
    expect(toOptionalDatabaseId(null)).toBeNull();
  });
});
