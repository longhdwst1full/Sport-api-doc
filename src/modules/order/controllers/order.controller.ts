import { Body, Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireAuthentication } from '../../../common/decorators/require-authentication.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../../common/request/request-context';
import { CART_HEADER } from '../../cart/cart.constants';
import {
  AccountOrderListDto,
  AccountOrderQueryDto,
  AdminOrderListDto,
  AdminOrderQueryDto,
  CompleteOrderCommandDto,
  ConfirmOrderCommandDto,
  GuestOrderPlacementDto,
  OrderCancelCommandDto,
  OrderDetailDto,
} from '../dto/order.dto';
import { OrderService } from '../services/order.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';

function requestId(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : (request.header('x-request-id') ?? `order-${Date.now()}`);
}

@ApiTags('Storefront Guest Orders')
@Controller('orders/guest')
export class GuestOrderController {
  constructor(private readonly orders: OrderService) {}

  @Post('from-checkout/:checkoutToken')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({
    operationId: 'placeGuestOrder',
    summary: 'Tạo đơn idempotent từ checkout và reservation đã xác nhận của khách vãng lai',
  })
  @ApiCreatedResponse({ type: GuestOrderPlacementDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  place(
    @Param('checkoutToken') checkoutToken: string,
    @Headers(CART_HEADER.GUEST_TOKEN) cartToken: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Req() request: Request,
  ): Promise<GuestOrderPlacementDto> {
    return this.orders.placeGuest(
      cartToken ?? '',
      checkoutToken,
      idempotencyKey ?? '',
      requestId(request),
    );
  }

  @Get(':orderNo')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiOperation({ operationId: 'getGuestOrder', summary: 'Xem đơn bằng mã đơn và token bí mật của khách vãng lai' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(
    @Param('orderNo') orderNo: string,
    @Headers(CART_HEADER.GUEST_TOKEN) cartToken: string,
  ): Promise<OrderDetailDto> {
    return this.orders.getGuest(cartToken ?? '', orderNo);
  }

  @Post(':orderNo/cancel')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'cancelGuestOrder', summary: 'Khách vãng lai hủy đơn chưa thanh toán/xử lý' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  cancel(
    @Param('orderNo') orderNo: string,
    @Headers(CART_HEADER.GUEST_TOKEN) cartToken: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() command: OrderCancelCommandDto,
    @Req() request: Request,
  ): Promise<OrderDetailDto> {
    return this.orders.cancelGuest(
      cartToken ?? '',
      orderNo,
      command,
      idempotencyKey ?? '',
      requestId(request),
    );
  }
}

@ApiTags('Storefront Account Orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@RequireAuthentication()
@Controller('account/orders')
export class AccountOrderController {
  constructor(private readonly orders: OrderService) {}

  @Post('from-checkout/:checkoutToken')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({
    operationId: 'placeAccountOrder',
    summary: 'Tạo đơn idempotent từ checkout và reservation đã xác nhận của khách đăng nhập',
  })
  @ApiCreatedResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  place(
    @Param('checkoutToken') checkoutToken: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDetailDto> {
    return this.orders.placeAccount(
      getAuthPrincipal(request).userId,
      checkoutToken,
      idempotencyKey ?? '',
      requestId(request),
    );
  }

  @Get()
  @ApiOperation({ operationId: 'listAccountOrders', summary: 'Danh sách đơn hàng của khách đang đăng nhập' })
  @ApiOkResponse({ type: AccountOrderListDto })
  list(
    @Query() query: AccountOrderQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AccountOrderListDto> {
    return this.orders.listAccount(getAuthPrincipal(request).userId, query);
  }

  @Get(':orderNo')
  @ApiOperation({ operationId: 'getAccountOrder', summary: 'Chi tiết đơn hàng thuộc khách đang đăng nhập' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(
    @Param('orderNo') orderNo: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDetailDto> {
    return this.orders.getAccount(getAuthPrincipal(request).userId, orderNo);
  }

  @Post(':orderNo/cancel')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'cancelAccountOrder', summary: 'Khách đăng nhập hủy đơn chưa thanh toán/xử lý' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  cancel(
    @Param('orderNo') orderNo: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() command: OrderCancelCommandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDetailDto> {
    const principal = getAuthPrincipal(request);
    return this.orders.cancelAccount(
      principal.userId,
      orderNo,
      command,
      idempotencyKey ?? '',
      requestId(request),
    );
  }
}

@ApiTags('Admin Orders')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('admin/orders')
export class AdminOrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @RequirePermissions('order.view')
  @ApiOperation({
    operationId: 'listAdminOrders',
    summary: 'Danh sách đơn hàng theo tab trạng thái, tìm kiếm và phạm vi chi nhánh',
  })
  @ApiOkResponse({ type: AdminOrderListDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  list(
    @Query() query: AdminOrderQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AdminOrderListDto> {
    return this.orders.listAdmin(query, getAuthPrincipal(request));
  }

  @Get(':id')
  @RequirePermissions('order.view')
  @ApiOperation({ operationId: 'getAdminOrder', summary: 'Chi tiết và lịch sử đơn hàng trong phạm vi chi nhánh' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  get(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDetailDto> {
    return this.orders.getAdmin(id, getAuthPrincipal(request));
  }

  @Post(':id/cancel')
  @RequirePermissions('order.manage')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'cancelAdminOrder', summary: 'Admin hủy đơn chưa thanh toán/xử lý trong phạm vi chi nhánh' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  cancel(
    @Param('id') id: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() command: OrderCancelCommandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDetailDto> {
    return this.orders.cancelAdmin(
      id,
      command,
      idempotencyKey ?? '',
      requestId(request),
      getAuthPrincipal(request),
    );
  }

  @Post(':id/confirm')
  @RequirePermissions('order.manage')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'confirmAdminOrder', summary: 'Admin xác nhận đơn đủ điều kiện để kho bắt đầu xử lý' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  confirm(
    @Param('id') id: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() command: ConfirmOrderCommandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDetailDto> {
    return this.orders.confirmAdmin(
      id,
      command,
      idempotencyKey ?? '',
      requestId(request),
      getAuthPrincipal(request),
    );
  }

  @Post(':id/complete')
  @RequirePermissions('order.manage')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({
    operationId: 'completeAdminOrder',
    summary: 'Admin hoàn tất đơn bất kỳ lúc nào sau khi đã giao đủ và thu đủ tiền',
  })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  complete(
    @Param('id') id: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() command: CompleteOrderCommandDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDetailDto> {
    return this.orders.completeAdmin(
      id,
      command,
      idempotencyKey ?? '',
      requestId(request),
      getAuthPrincipal(request),
    );
  }
}
