import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CreateStockAdjustmentDto,
  InventoryBalanceDto,
  InventoryBalanceListDto,
  StockAdjustmentResultDto,
} from './inventory.dto';

type StoredBalance = Omit<InventoryBalanceDto, 'available' | 'status'>;

@Injectable()
export class InventoryService {
  private readonly idempotencyResults = new Map<string, StockAdjustmentResultDto>();
  private readonly balances: StoredBalance[] = [
    {
      id: 'balance-run-x1',
      warehouseCode: 'WH-HCM-01',
      sku: 'RUN-X1',
      productName: 'Máy chạy bộ DCTD Pro X1',
      onHand: 12,
      reserved: 2,
      reorderPoint: 3,
    },
    {
      id: 'balance-combo-home',
      warehouseCode: 'WH-HCM-01',
      sku: 'COMBO-HOME-01',
      productName: 'Combo tập gym tại nhà',
      onHand: 20,
      reserved: 1,
      reorderPoint: 5,
    },
  ];

  list(): InventoryBalanceListDto {
    const items = this.balances.map((balance) => this.toDto(balance));
    return { items, total: items.length };
  }

  adjust(input: CreateStockAdjustmentDto, idempotencyKey: string): StockAdjustmentResultDto {
    if (!idempotencyKey.trim()) throw new BadRequestException('Idempotency-Key is required');
    const previous = this.idempotencyResults.get(idempotencyKey);
    if (previous) return previous;
    if (!input.items.length)
      throw new BadRequestException('At least one adjustment item is required');

    const changes = input.items.map((item) => {
      const balance = this.balances.find(
        (candidate) =>
          candidate.warehouseCode === input.warehouseCode && candidate.sku === item.sku,
      );
      if (!balance) throw new BadRequestException(`Balance not found for SKU ${item.sku}`);
      const nextOnHand = balance.onHand + item.quantityDelta;
      if (nextOnHand < balance.reserved) {
        throw new BadRequestException(
          `Adjustment would make ${item.sku} lower than reserved stock`,
        );
      }
      return { balance, nextOnHand };
    });

    changes.forEach(({ balance, nextOnHand }) => {
      balance.onHand = nextOnHand;
    });
    const result: StockAdjustmentResultDto = {
      adjustmentNo: `ADJ-${String(this.idempotencyResults.size + 1).padStart(6, '0')}`,
      status: 'POSTED',
      reason: input.reason,
      balances: changes.map(({ balance }) => this.toDto(balance)),
      postedAt: new Date().toISOString(),
    };
    this.idempotencyResults.set(idempotencyKey, result);
    return result;
  }

  private toDto(balance: StoredBalance): InventoryBalanceDto {
    const available = balance.onHand - balance.reserved;
    const status =
      available === 0
        ? 'OUT_OF_STOCK'
        : available <= balance.reorderPoint
          ? 'LOW_STOCK'
          : 'IN_STOCK';
    return { ...balance, available, status };
  }
}
