import { Controller, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireAuthentication } from '../../../common/decorators/require-authentication.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../../common/request/request-context';
import { CART_HEADER } from '../../cart/cart.constants';
import { AdminOrderListDto, AdminOrderQueryDto, OrderDetailDto } from '../dto/order.dto';
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
  @ApiCreatedResponse({ type: OrderDetailDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  place(
    @Param('checkoutToken') checkoutToken: string,
    @Headers(CART_HEADER.GUEST_TOKEN) cartToken: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Req() request: Request,
  ): Promise<OrderDetailDto> {
    return this.orders.placeGuest(
      cartToken ?? '',
      checkoutToken,
      idempotencyKey ?? '',
      requestId(request),
    );
  }
}

@ApiTags('Storefront Account Orders')
@ApiBearerAuth()
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
}

@ApiTags('Admin Orders')
@ApiBearerAuth()
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
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  get(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<OrderDetailDto> {
    return this.orders.getAdmin(id, getAuthPrincipal(request));
  }
}

