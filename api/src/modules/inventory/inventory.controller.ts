import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
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
  listInventoryBalances(@Req() request: AuthenticatedRequest): Promise<InventoryBalanceListDto> {
    return this.inventory.list(getAuthPrincipal(request));
  }

  @Post('adjustments')
  @RequirePermissions('inventory.stock.adjust')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ operationId: 'createStockAdjustment', summary: 'Post a basic stock adjustment' })
  @ApiCreatedResponse({ type: StockAdjustmentResultDto })
  createStockAdjustment(
    @Body() input: CreateStockAdjustmentDto,
    @Headers('idempotency-key') idempotencyKey = '',
    @Req() request: AuthenticatedRequest,
  ): Promise<StockAdjustmentResultDto> {
    const principal = getAuthPrincipal(request);
    const requestId = typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : (request.header('x-request-id') ?? `inventory-${idempotencyKey}`);
    return this.inventory.adjust(input, idempotencyKey, principal, requestId);
  }
}
