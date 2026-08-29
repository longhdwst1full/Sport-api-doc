import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreateStockAdjustmentDto,
  InventoryBalanceListDto,
  StockAdjustmentResultDto,
} from './inventory.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Admin Inventory')
@ApiBearerAuth()
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('balances')
  @RequirePermissions('inventory.stock.view')
  @ApiOperation({ operationId: 'listInventoryBalances', summary: 'List warehouse balances' })
  @ApiOkResponse({ type: InventoryBalanceListDto })
  listInventoryBalances(): InventoryBalanceListDto {
    return this.inventory.list();
  }

  @Post('adjustments')
  @RequirePermissions('inventory.stock.adjust')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ operationId: 'createStockAdjustment', summary: 'Post a basic stock adjustment' })
  @ApiCreatedResponse({ type: StockAdjustmentResultDto })
  createStockAdjustment(
    @Body() input: CreateStockAdjustmentDto,
    @Headers('idempotency-key') idempotencyKey = '',
  ): StockAdjustmentResultDto {
    return this.inventory.adjust(input, idempotencyKey);
  }
}
