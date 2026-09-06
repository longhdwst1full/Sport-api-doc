import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { ParseEntityIdPipe } from '../../common/identifiers/entity-id';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import { STOCK_TRANSFER_PERMISSION } from './stock-transfer.constants';
import {
  CreateStockTransferDto,
  ReceiveStockTransferDto,
  StockTransferDetailDto,
  StockTransferListDto,
  StockTransferQueryDto,
  StockTransferTransitionDto,
} from './stock-transfer.dto';
import { StockTransferQueryService } from './stock-transfer-query.service';
import { StockTransferService } from './stock-transfer.service';

@ApiTags('Admin Inventory Transfers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@ApiForbiddenResponse({ type: ErrorResponseDto })
@ApiServiceUnavailableResponse({ type: ErrorResponseDto })
@Controller('admin/inventory/transfers')
export class StockTransferController {
  constructor(
    private readonly transfers: StockTransferService,
    private readonly queries: StockTransferQueryService,
  ) {}

  @Get()
  @RequirePermissions(STOCK_TRANSFER_PERMISSION.VIEW)
  @ApiOperation({ operationId: 'listStockTransfers', summary: 'List stock transfers visible to the assigned branches' })
  @ApiOkResponse({ type: StockTransferListDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  list(@Query() query: StockTransferQueryDto, @Req() request: AuthenticatedRequest) {
    return this.queries.list(query, getAuthPrincipal(request));
  }

  @Get(':id')
  @RequirePermissions(STOCK_TRANSFER_PERMISSION.VIEW)
  @ApiOperation({ operationId: 'getStockTransfer', summary: 'Get stock transfer detail' })
  @ApiOkResponse({ type: StockTransferDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('id', new ParseEntityIdPipe()) id: string, @Req() request: AuthenticatedRequest) {
    return this.queries.get(id, getAuthPrincipal(request));
  }

  @Post()
  @RequirePermissions(STOCK_TRANSFER_PERMISSION.CREATE)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ operationId: 'createStockTransfer', summary: 'Create a DRAFT full-shipment stock transfer' })
  @ApiCreatedResponse({ type: StockTransferDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  create(
    @Body() input: CreateStockTransferDto,
    @Headers('idempotency-key') idempotencyKey = '',
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transfers.create(input, idempotencyKey, getAuthPrincipal(request), this.requestId(request));
  }

  @Post(':id/submit')
  @RequirePermissions(STOCK_TRANSFER_PERMISSION.CREATE)
  @ApiOperation({ operationId: 'submitStockTransfer', summary: 'Submit a DRAFT transfer' })
  @ApiOkResponse({ type: StockTransferDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  submit(
    @Param('id', new ParseEntityIdPipe()) id: string,
    @Body() input: StockTransferTransitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transfers.submit(id, input, getAuthPrincipal(request), this.requestId(request));
  }

  @Post(':id/ship')
  @RequirePermissions(STOCK_TRANSFER_PERMISSION.SHIP)
  @ApiOperation({ operationId: 'shipStockTransfer', summary: 'Ship every requested item from the source warehouse' })
  @ApiOkResponse({ type: StockTransferDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  ship(
    @Param('id', new ParseEntityIdPipe()) id: string,
    @Body() input: StockTransferTransitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transfers.ship(id, input, getAuthPrincipal(request), this.requestId(request));
  }

  @Post(':id/receive')
  @RequirePermissions(STOCK_TRANSFER_PERMISSION.RECEIVE)
  @ApiOperation({ operationId: 'receiveStockTransfer', summary: 'Receive a full shipment and record damaged quantities' })
  @ApiOkResponse({ type: StockTransferDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  receive(
    @Param('id', new ParseEntityIdPipe()) id: string,
    @Body() input: ReceiveStockTransferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.transfers.receive(id, input, getAuthPrincipal(request), this.requestId(request));
  }

  private requestId(request: AuthenticatedRequest): string {
    return typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : (request.header('x-request-id') ?? `transfer-${Date.now()}`);
  }
}
