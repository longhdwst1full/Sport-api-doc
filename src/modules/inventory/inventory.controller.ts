import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import {
  CreateStockAdjustmentDto,
  InventoryBalanceListDto,
  InventoryBalanceSummaryDto,
  StockAdjustmentResultDto,
} from './inventory.dto';
import {
  InventoryBalanceQueryDto,
  InventoryMovementListDto,
  InventoryMovementQueryDto,
  StockAdjustmentDetailDto,
  StockAdjustmentListDto,
  StockAdjustmentQueryDto,
} from './inventory-query.dto';
import { InventoryQueryService } from './inventory-query.service';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { ParseEntityIdPipe } from '../../common/identifiers/entity-id';
import { InventoryService } from './inventory.service';

@ApiTags('Admin Inventory')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@ApiServiceUnavailableResponse({ type: ErrorResponseDto })
@Controller('admin/inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly queries: InventoryQueryService,
  ) {}

  @Get('balances')
  @RequirePermissions('inventory.stock.view')
  @ApiOperation({ operationId: 'listInventoryBalances', summary: 'List warehouse balances' })
  @ApiOkResponse({ type: InventoryBalanceListDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listInventoryBalances(
    @Query() query: InventoryBalanceQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<InventoryBalanceListDto> {
    return this.queries.listBalances(query, getAuthPrincipal(request));
  }

  /**
   * Số liệu tổng hợp cho các thẻ trên màn tồn kho.
   *
   * Tách khỏi `listInventoryBalances` thay vì nhồi vào response phân trang: thẻ số liệu và bảng
   * dùng bộ lọc giống nhau nhưng nhịp tải lại khác nhau (đổi trang không cần tính lại tổng).
   */
  @Get('balances/summary')
  @RequirePermissions('inventory.stock.view')
  @ApiOperation({
    operationId: 'summarizeInventoryBalances',
    summary: 'Tổng hợp tồn kho trên toàn bộ dòng khớp bộ lọc, không chỉ trang đang xem',
  })
  @ApiOkResponse({ type: InventoryBalanceSummaryDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  summarizeInventoryBalances(
    @Query() query: InventoryBalanceQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<InventoryBalanceSummaryDto> {
    return this.queries.summarizeBalances(query, getAuthPrincipal(request));
  }

  @Get('movements')
  @RequirePermissions('inventory.stock.view')
  @ApiOperation({ operationId: 'listInventoryMovements', summary: 'List immutable stock ledger entries' })
  @ApiOkResponse({ type: InventoryMovementListDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listInventoryMovements(
    @Query() query: InventoryMovementQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<InventoryMovementListDto> {
    return this.queries.listMovements(query, getAuthPrincipal(request));
  }

  @Get('adjustments')
  @RequirePermissions('inventory.stock.view')
  @ApiOperation({ operationId: 'listStockAdjustments', summary: 'List posted stock adjustment documents' })
  @ApiOkResponse({ type: StockAdjustmentListDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  listStockAdjustments(
    @Query() query: StockAdjustmentQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<StockAdjustmentListDto> {
    return this.queries.listAdjustments(query, getAuthPrincipal(request));
  }

  @Get('adjustments/:id')
  @RequirePermissions('inventory.stock.view')
  @ApiOperation({ operationId: 'getStockAdjustment', summary: 'Get a posted stock adjustment document' })
  @ApiOkResponse({ type: StockAdjustmentDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getStockAdjustment(
    @Param('id', new ParseEntityIdPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<StockAdjustmentDetailDto> {
    return this.queries.getAdjustment(id, getAuthPrincipal(request));
  }

  @Post('adjustments')
  @RequirePermissions('inventory.stock.adjust')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ operationId: 'createStockAdjustment', summary: 'Post a basic stock adjustment' })
  @ApiCreatedResponse({ type: StockAdjustmentResultDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
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
