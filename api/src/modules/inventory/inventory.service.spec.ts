import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  it('posts an idempotent stock adjustment', () => {
    const service = new InventoryService();
    const input = {
      warehouseCode: 'WH-HCM-01',
      reason: 'Nhập tồn đầu kỳ',
      items: [{ sku: 'RUN-X1', quantityDelta: 3 }],
    };
    const first = service.adjust(input, 'initial-run-x1');
    const replay = service.adjust(input, 'initial-run-x1');
    expect(first.balances[0].onHand).toBe(15);
    expect(replay).toEqual(first);
    expect(service.list().items[0].onHand).toBe(15);
  });

  it('does not let on-hand stock fall below reserved stock', () => {
    const service = new InventoryService();
    expect(() =>
      service.adjust(
        {
          warehouseCode: 'WH-HCM-01',
          reason: 'Sai lệch',
          items: [{ sku: 'RUN-X1', quantityDelta: -11 }],
        },
        'invalid-adjustment',
      ),
    ).toThrow(BadRequestException);
  });
});
