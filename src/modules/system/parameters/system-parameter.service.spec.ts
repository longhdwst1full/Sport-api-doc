import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditWriter } from '../../audit/audit.writer';
import { SYSTEM_PARAMETER_CODE } from './system-parameter.catalog';
import { SystemParameterService } from './system-parameter.service';

const FIXTURE = {
  CODE: SYSTEM_PARAMETER_CODE.SHIPPING_SMALL_FEE_VND,
  STORED_VALUE: '65000',
  CATALOG_DEFAULT: 50_000,
  CORRUPT_VALUE: 'không-phải-số',
} as const;

function serviceWith(rows: Array<{ code: string; value: string }>, enabled = true) {
  const prisma = {
    isEnabled: () => enabled,
    systemParameter: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
  return new SystemParameterService(prisma, { write: jest.fn() } as unknown as AuditWriter);
}

describe('SystemParameterService', () => {
  it('đọc giá trị đang cấu hình trong database', async () => {
    const service = serviceWith([{ code: FIXTURE.CODE, value: FIXTURE.STORED_VALUE }]);

    await expect(service.getInteger(FIXTURE.CODE)).resolves.toBe(Number(FIXTURE.STORED_VALUE));
  });

  it('rơi về mặc định catalog khi chưa có bản ghi', async () => {
    const service = serviceWith([]);

    await expect(service.getInteger(FIXTURE.CODE)).resolves.toBe(FIXTURE.CATALOG_DEFAULT);
  });

  it('rơi về mặc định khi giá trị trong database bị hỏng', async () => {
    // Cấu hình sai không được làm sập luồng bán hàng.
    const service = serviceWith([{ code: FIXTURE.CODE, value: FIXTURE.CORRUPT_VALUE }]);

    await expect(service.getInteger(FIXTURE.CODE)).resolves.toBe(FIXTURE.CATALOG_DEFAULT);
  });

  it('rơi về mặc định khi database chưa bật', async () => {
    const service = serviceWith([], false);

    await expect(service.getInteger(FIXTURE.CODE)).resolves.toBe(FIXTURE.CATALOG_DEFAULT);
  });

  it('chặn giá trị nằm ngoài khoảng cho phép của tham số', async () => {
    const service = serviceWith([]);

    // `SHIPPING_FREE_RADIUS_KM` giới hạn 0..100 trong catalog.
    await expect(
      service.update(
        SYSTEM_PARAMETER_CODE.SHIPPING_FREE_RADIUS_KM,
        { expectedVersion: '0', value: '5000', reason: 'Kiểm thử ngoài khoảng' },
        { requestId: 'test', actorUserId: '' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('chặn giá trị không phải số nguyên', async () => {
    const service = serviceWith([]);

    await expect(
      service.update(
        SYSTEM_PARAMETER_CODE.SHIPPING_FREE_RADIUS_KM,
        { expectedVersion: '0', value: '10.5', reason: 'Kiểm thử số thập phân' },
        { requestId: 'test', actorUserId: '' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
