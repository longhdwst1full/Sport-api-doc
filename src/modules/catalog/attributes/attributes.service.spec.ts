import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';
import type { AuditWriter } from '../../audit/audit.writer';
import { AttributesService } from './attributes.service';

const attribute = (overrides: Record<string, unknown>) => ({
  id: 1n,
  code: 'MATERIAL',
  name: 'Chất liệu',
  dataType: 'TEXT',
  unit: null,
  isVariantAxis: false,
  options: null,
  status: 'ACTIVE',
  sortOrder: 0,
  version: 0n,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const dictionary = [
  attribute({ id: 1n, code: 'MATERIAL', dataType: 'TEXT', sortOrder: 20 }),
  attribute({ id: 2n, code: 'ADJUSTABLE_HEIGHT', name: 'Chiều cao điều chỉnh', dataType: 'NUMBER', unit: 'm', sortOrder: 10 }),
  attribute({ id: 3n, code: 'NET_CRANK', name: 'Tay quay căng lưới', dataType: 'BOOLEAN', sortOrder: 30 }),
  attribute({ id: 4n, code: 'COLOR', name: 'Màu sắc', dataType: 'OPTION', options: [{ code: 'WHITE', label: 'Trắng', colorHex: '#FFFFFF' }], sortOrder: 5 }),
  attribute({ id: 5n, code: 'OLD_SPEC', dataType: 'TEXT', status: 'INACTIVE' }),
];

function build(used = false) {
  const client = {
    attribute: {
      findMany: jest.fn(({ where }: { where: { code: { in: string[] } } }) =>
        Promise.resolve(dictionary.filter(({ code }) => where.code.in.includes(code)))),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue(used ? [{ one: 1 }] : []),
  };
  const prisma = {
    ...client,
    $transaction: jest.fn((work: (transaction: typeof client) => unknown) => work(client)),
  } as unknown as PrismaService;
  const service = new AttributesService(prisma, { write: jest.fn() } as unknown as AuditWriter);
  return { service, client };
}

describe('AttributesService specifications (decision D61)', () => {
  it('normalizes TD-02 values by data type and stores only codes and values', async () => {
    const { service, client } = build();

    const stored = await service.validateSpecifications(client as never, [
      { code: 'MATERIAL', values: [' Thép '] },
      { code: 'ADJUSTABLE_HEIGHT', values: [1.55, 2.25, 2.44] },
      { code: 'NET_CRANK', values: [true] },
      { code: 'COLOR', values: ['white'] },
    ], []);

    expect(stored).toEqual([
      { code: 'MATERIAL', values: ['Thép'] },
      { code: 'ADJUSTABLE_HEIGHT', values: [1.55, 2.25, 2.44] },
      { code: 'NET_CRANK', values: [true] },
      { code: 'COLOR', values: ['WHITE'] },
    ]);
  });

  it.each([
    ['unknown attribute', [{ code: 'NOPE', values: ['x'] }]],
    ['number given as text', [{ code: 'ADJUSTABLE_HEIGHT', values: ['2.25m'] }]],
    ['option not in the list', [{ code: 'COLOR', values: ['BLACK'] }]],
    ['two booleans', [{ code: 'NET_CRANK', values: [true, false] }]],
    ['empty values', [{ code: 'MATERIAL', values: [] }]],
    ['duplicated attribute', [{ code: 'MATERIAL', values: ['a'] }, { code: 'MATERIAL', values: ['b'] }]],
  ])('rejects %s', async (_case, input) => {
    const { service, client } = build();

    await expect(service.validateSpecifications(client as never, input, [])).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('keeps an unchanged inactive attribute but refuses to add or change it', async () => {
    const { service, client } = build();
    const current = [{ code: 'OLD_SPEC', values: ['giữ nguyên'] }];

    await expect(service.validateSpecifications(client as never, current, current)).resolves.toEqual(current);
    await expect(service.validateSpecifications(client as never, [{ code: 'OLD_SPEC', values: ['mới'] }], current))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('resolves labels and units from the dictionary in attribute order', async () => {
    const { service } = build();

    const resolved = await service.resolve([
      { code: 'MATERIAL', values: ['Thép'] },
      { code: 'ADJUSTABLE_HEIGHT', values: [2.25] },
      { code: 'COLOR', values: ['WHITE'] },
      { code: 'NET_CRANK', values: [true] },
    ]);

    expect(resolved.map(({ code, values }) => [code, values.map(({ label }) => label)])).toEqual([
      ['COLOR', ['Trắng']],
      ['ADJUSTABLE_HEIGHT', ['2,25 m']],
      ['MATERIAL', ['Thép']],
      ['NET_CRANK', ['Có']],
    ]);
  });

  it('does not query the dictionary for a product without specifications', async () => {
    const { service, client } = build();

    await expect(service.resolve([])).resolves.toEqual([]);
    expect(client.attribute.findMany).not.toHaveBeenCalled();
  });
});

describe('AttributesService.update guards data already in use', () => {
  it('refuses to change the unit of a NUMBER attribute used by products', async () => {
    const { service, client } = build(true);
    client.attribute.findUnique.mockResolvedValue(dictionary[1]);

    await expect(service.update('2', { unit: 'cm', expectedVersion: 0 }, { requestId: 'r', actorUserId: '1' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(client.attribute.update).not.toHaveBeenCalled();
  });

  it('refuses to remove an option used by products', async () => {
    const { service, client } = build(true);
    client.attribute.findUnique.mockResolvedValue(dictionary[3]);

    await expect(service.update('4', { options: [{ code: 'BLACK', label: 'Đen' }], expectedVersion: 0 }, { requestId: 'r', actorUserId: '1' }))
      .rejects.toMatchObject({ response: { code: 'ATTRIBUTE_IN_USE' } });
  });
});
