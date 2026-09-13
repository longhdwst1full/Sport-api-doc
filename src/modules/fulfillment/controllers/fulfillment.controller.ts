import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal, getMutationContext } from '../../../common/request/request-context';
import {
  AdminFulfillmentListDto,
  AdminFulfillmentQueryDto,
  FailDeliveryDto,
  FulfillmentDetailDto,
  FulfillmentTransitionDto,
  ReceiveReturnDto,
  ShipFulfillmentDto,
} from '../dto/fulfillment.dto';
import { FulfillmentService } from '../services/fulfillment.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';

@ApiTags('Admin Fulfillments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('admin/fulfillments')
export class AdminFulfillmentController {
  constructor(private readonly fulfillments: FulfillmentService) {}

  @Get()
  @RequirePermissions('fulfillment.view')
  @ApiOperation({ operationId: 'listAdminFulfillments', summary: 'Danh sách giao vận theo kho, trạng thái và thông tin đơn hàng' })
  @ApiOkResponse({ type: AdminFulfillmentListDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  list(@Query() query: AdminFulfillmentQueryDto, @Req() request: AuthenticatedRequest) {
    return this.fulfillments.list(query, getAuthPrincipal(request));
  }

  @Get('by-order/:orderId')
  @RequirePermissions('fulfillment.view')
  @ApiOperation({ operationId: 'getAdminFulfillmentByOrder', summary: 'Chi tiết giao vận của một đơn hàng' })
  @ApiOkResponse({ type: FulfillmentDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  getByOrder(@Param('orderId') orderId: string, @Req() request: AuthenticatedRequest) {
    return this.fulfillments.getByOrder(orderId, getAuthPrincipal(request));
  }

  @Get(':id')
  @RequirePermissions('fulfillment.view')
  @ApiOperation({ operationId: 'getAdminFulfillment', summary: 'Chi tiết và lịch sử giao vận' })
  @ApiOkResponse({ type: FulfillmentDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.fulfillments.get(id, getAuthPrincipal(request));
  }

  @Post(':id/pick')
  @RequirePermissions('fulfillment.pick')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'pickAdminFulfillment', summary: 'Bắt đầu lấy hàng trong kho' })
  @ApiOkResponse({ type: FulfillmentDetailDto })
  actionPick(@Param('id') id: string, @Body() input: FulfillmentTransitionDto,
    @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.fulfillments.pick(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/pack')
  @RequirePermissions('fulfillment.pack')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'packAdminFulfillment', summary: 'Xác nhận đã đóng gói toàn bộ đơn' })
  @ApiOkResponse({ type: FulfillmentDetailDto })
  actionPack(@Param('id') id: string, @Body() input: FulfillmentTransitionDto,
    @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.fulfillments.pack(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/ship')
  @RequirePermissions('fulfillment.ship')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'shipAdminFulfillment', summary: 'Bàn giao vận chuyển và commit tồn kho atomically' })
  @ApiOkResponse({ type: FulfillmentDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  actionShip(@Param('id') id: string, @Body() input: ShipFulfillmentDto,
    @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.fulfillments.ship(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/deliver')
  @RequirePermissions('fulfillment.delivery_update')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'deliverAdminFulfillment', summary: 'Xác nhận khách đã nhận đủ hàng' })
  @ApiOkResponse({ type: FulfillmentDetailDto })
  actionDeliver(@Param('id') id: string, @Body() input: FulfillmentTransitionDto,
    @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.fulfillments.deliver(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/fail-delivery')
  @RequirePermissions('fulfillment.delivery_update')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'failAdminFulfillmentDelivery', summary: 'Ghi nhận giao thất bại và đưa hàng về kho xuất' })
  @ApiOkResponse({ type: FulfillmentDetailDto })
  actionFail(@Param('id') id: string, @Body() input: FailDeliveryDto,
    @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.fulfillments.failDelivery(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }

  @Post(':id/receive-return')
  @RequirePermissions('fulfillment.delivery_update')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'receiveAdminFulfillmentReturn', summary: 'Kho nhận hàng giao thất bại; chỉ SELLABLE được hoàn tồn bán' })
  @ApiOkResponse({ type: FulfillmentDetailDto })
  actionReceive(@Param('id') id: string, @Body() input: ReceiveReturnDto,
    @Headers(IDEMPOTENCY_HEADER) key: string, @Req() request: AuthenticatedRequest) {
    const context = getMutationContext(request);
    return this.fulfillments.receiveReturn(id, input, key ?? '', context.requestId, getAuthPrincipal(request));
  }
}
