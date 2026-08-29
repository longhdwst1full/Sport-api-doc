import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { AuditWriter } from '../../../audit/audit.writer';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const service = new ProductsService({} as PrismaService, {} as AuditWriter);

  it('rejects a primary category outside the selected categories before persistence', async () => {
    await expect(
      service.create(
        {
          productNo: 'SP-001',
          name: 'Tạ tay',
          slug: 'ta-tay',
          categoryIds: ['00000000-0000-7000-8000-000000000001'],
          primaryCategoryId: '00000000-0000-7000-8000-000000000002',
        },
        { requestId: 'unit-request', actorUserId: '00000000-0000-7000-8000-000000000010' },
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
