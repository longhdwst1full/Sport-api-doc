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

describe('SystemParameterService với tham số bí mật', () => {
  const secretRow = {
    id: 1n,
    code: 'GHN_TOKEN',
    groupCode: 'INTEGRATION',
    label: 'Token GHN',
    description: null,
    valueType: 'STRING',
    value: 'token-that-cua-ghn',
    defaultValue: '',
    minValue: null,
    maxValue: null,
    unit: null,
    status: 'ACTIVE',
    isPublic: false,
    isSystem: true,
    isSecret: true,
    remarks: null,
    version: 3n,
    updatedAt: new Date('2026-09-17T00:00:00.000Z'),
    updatedBy: null,
  };

  function buildService(row = secretRow) {
    const update = jest.fn(
      (args: { data: Record<string, unknown> }): Promise<typeof secretRow> => {
        void args;
        return Promise.resolve({ ...row, version: row.version + 1n });
      },
    );
    const auditWrite = jest.fn((entry: Record<string, unknown>): Promise<void> => {
      void entry;
      return Promise.resolve();
    });
    const prisma = {
      isEnabled: () => true,
      systemParameter: {
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(row),
        update,
      },
      $transaction: jest.fn((work: (client: unknown) => unknown) =>
        work({ systemParameter: { findUnique: () => Promise.resolve(row), update } }),
      ),
    } as unknown as PrismaService;
    const service = new SystemParameterService(prisma, {
      write: auditWrite,
    } as unknown as AuditWriter);
    return { service, update, auditWrite };
  }

  it('không trả giá trị bí mật ra API đọc', async () => {
    const { service } = buildService();

    const listed = await service.list({ page: 1, limit: 20 } as never);

    expect(listed.items[0].value).not.toContain('token-that-cua-ghn');
    // Vẫn phải nói được là đã cấu hình hay chưa.
    expect(listed.items[0].value).toBeTruthy();
    expect(listed.items[0].isSecret).toBe(true);
  });

  it('gửi lại dấu che thì giữ nguyên giá trị cũ, không ghi dấu chấm thành token', async () => {
    const { service, update } = buildService();

    await service.update(
      'GHN_TOKEN',
      { value: '••••••••', expectedVersion: 3, reason: 'Không đổi token' } as never,
      { requestId: 'r1', actorUserId: '2' } as never,
    );

    expect(update.mock.calls[0]?.[0].data.value).toBe('token-that-cua-ghn');
  });

  it('không chép giá trị bí mật vào audit', async () => {
    const { service, auditWrite } = buildService();

    await service.update(
      'GHN_TOKEN',
      { value: 'token-moi', expectedVersion: 3, reason: 'Xoay token' } as never,
      { requestId: 'r1', actorUserId: '2' } as never,
    );

    const entry = JSON.stringify(auditWrite.mock.calls[0]?.[0] ?? {});
    expect(entry).not.toContain('token-that-cua-ghn');
    expect(entry).not.toContain('token-moi');
  });

  it('cho phép cập nhật không cần lý do nhưng vẫn ghi actor và thay đổi vào audit', async () => {
    const { service, update, auditWrite } = buildService();

    await service.update(
      'GHN_TOKEN',
      { value: 'token-moi', expectedVersion: 3 } as never,
      { requestId: 'r1', actorUserId: '2' } as never,
    );

    expect(update.mock.calls[0]?.[0].data.remarks).toBeNull();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'r1', actorUserId: '2', action: 'system.parameter.update' }),
      expect.anything(),
    );
    expect(auditWrite.mock.calls[0]?.[0]).not.toHaveProperty('reason');
  });
});

/**
 * `syncCatalog` chạy ở mỗi lần khởi động (và mỗi cold start). Bản cũ gọi `findUnique` rồi `update`
 * tuần tự cho TỪNG tham số: 39 tham số là ~78 lượt đi database, mỗi lượt ~450ms tới Supabase.
 */
describe('SystemParameterService.syncCatalog', () => {
  function createService(existingCodes: string[]) {
    const findMany = jest.fn().mockResolvedValue(existingCodes.map((code) => ({ code })));
    const createMany = jest
      .fn<Promise<{ count: number }>, [{ data: { code: string }[]; skipDuplicates?: boolean }]>()
      .mockResolvedValue({ count: 0 });
    const update = jest
      .fn<{ __update: boolean }, [{ data: Record<string, unknown> }]>()
      .mockReturnValue({ __update: true });
    const transaction = jest.fn().mockResolvedValue([]);
    const prisma = {
      isEnabled: () => true,
      systemParameter: { findMany, createMany, update },
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new SystemParameterService(
      prisma,
      { write: jest.fn() } as unknown as AuditWriter,
    );
    return { service, findMany, createMany, update, transaction };
  }

  it('đọc một lần, tạo một lần, cập nhật trong một batch — không phải mỗi tham số một lượt', async () => {
    const { service, findMany, createMany, transaction } = createService([
      SYSTEM_PARAMETER_CODE.SHIPPING_SMALL_FEE_VND,
    ]);

    await service.syncCatalog();

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('chỉ tạo những tham số còn thiếu và trả về số lượng đã tạo', async () => {
    const { service, createMany } = createService([SYSTEM_PARAMETER_CODE.SHIPPING_SMALL_FEE_VND]);

    const created = await service.syncCatalog();

    const payload = createMany.mock.calls[0]?.[0];
    expect(payload?.data.some((row) => row.code === SYSTEM_PARAMETER_CODE.SHIPPING_SMALL_FEE_VND))
      .toBe(false);
    expect(created).toBe(payload?.data.length);
  });

  /** Hai instance khởi động cùng lúc đều thấy "chưa có"; trùng khoá không được làm instance chết. */
  it('bỏ qua bản ghi trùng khi hai instance cùng đồng bộ', async () => {
    const { service, createMany } = createService([]);

    await service.syncCatalog();

    expect(createMany.mock.calls[0]?.[0]).toMatchObject({ skipDuplicates: true });
  });

  /** `value` là của vận hành: đồng bộ metadata không được ghi đè giá trị đang chạy. */
  it('không ghi đè value của bản ghi đã có', async () => {
    const { service, update } = createService([SYSTEM_PARAMETER_CODE.SHIPPING_SMALL_FEE_VND]);

    await service.syncCatalog();

    const data = update.mock.calls[0]?.[0];
    expect(data?.data).not.toHaveProperty('value');
    expect(data?.data).toHaveProperty('defaultValue');
  });

  it('database tắt thì không đụng tới nó', async () => {
    const { service, findMany } = createService([]);
    const disabled = new SystemParameterService(
      { isEnabled: () => false } as unknown as PrismaService,
      { write: jest.fn() } as unknown as AuditWriter,
    );

    await expect(disabled.syncCatalog()).resolves.toBe(0);
    expect(findMany).not.toHaveBeenCalled();
    void service;
  });
});
