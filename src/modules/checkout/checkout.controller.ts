import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireAuthentication } from '../../common/decorators/require-authentication.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import { CART_HEADER } from '../cart/cart.constants';
import { CartService } from '../cart/cart.service';
import { CheckoutQuoteDto, CreateCheckoutQuoteDto, ReleaseReservationDto, ReservationDto, UpdateManualShippingQuoteDto } from './checkout.dto';
import { CheckoutService } from './checkout.service';
import { InventoryReservationService } from './inventory-reservation.service';

const IDEMPOTENCY_HEADER = 'idempotency-key';

function requestId(request: Request): string {
  return typeof request.id === 'string' || typeof request.id === 'number'
    ? String(request.id)
    : (request.header('x-request-id') ?? `checkout-${Date.now()}`);
}

@ApiTags('Storefront Guest Checkout')
@Controller('checkouts/guest')
export class GuestCheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly carts: CartService,
    private readonly reservations: InventoryReservationService,
  ) {}

  @Post('quote')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'quoteGuestCheckout', summary: 'Revalidate a guest cart and choose an eligible fulfillment branch' })
  @ApiCreatedResponse({ type: CheckoutQuoteDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  quote(
    @Headers(CART_HEADER.GUEST_TOKEN) cartToken: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() input: CreateCheckoutQuoteDto,
    @Req() request: Request,
  ): Promise<CheckoutQuoteDto> {
    return this.checkout.quoteGuest(cartToken ?? '', input, idempotencyKey ?? '', requestId(request));
  }

  @Get(':checkoutToken')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiOperation({ operationId: 'getGuestCheckoutQuote', summary: 'Reload an owned guest quote after staff consultation' })
  @ApiOkResponse({ type: CheckoutQuoteDto })
  getQuote(
    @Param('checkoutToken') checkoutToken: string,
    @Headers(CART_HEADER.GUEST_TOKEN) cartToken: string,
  ): Promise<CheckoutQuoteDto> {
    return this.checkout.getGuest(cartToken ?? '', checkoutToken);
  }

  @Post(':checkoutToken/confirm')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'confirmGuestCheckout', summary: 'Confirm a guest quote and reserve its physical SKU demand atomically' })
  @ApiCreatedResponse({ type: ReservationDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async confirm(
    @Param('checkoutToken') checkoutToken: string,
    @Headers(CART_HEADER.GUEST_TOKEN) cartToken: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Req() request: Request,
  ): Promise<ReservationDto> {
    const cartId = await this.carts.resolveGuestCartId(cartToken ?? '');
    return this.reservations.confirm(checkoutToken, idempotencyKey ?? '', requestId(request), {
      actorType: 'GUEST',
      cartId,
    });
  }

  @Post('reservations/:reservationToken/release')
  @ApiHeader({ name: CART_HEADER.GUEST_TOKEN, required: true })
  @ApiOperation({ operationId: 'releaseGuestReservation', summary: 'Release a guest reservation before fulfillment handover' })
  @ApiOkResponse({ type: ReservationDto })
  async release(
    @Param('reservationToken') reservationToken: string,
    @Headers(CART_HEADER.GUEST_TOKEN) cartToken: string,
    @Body() input: ReleaseReservationDto,
    @Req() request: Request,
  ): Promise<ReservationDto> {
    const cartId = await this.carts.resolveGuestCartId(cartToken ?? '');
    return this.reservations.release(reservationToken, input.reason, requestId(request), undefined, {
      actorType: 'GUEST',
      cartId,
    });
  }
}

@ApiTags('Storefront Account Checkout')
@ApiBearerAuth()
@RequireAuthentication()
@Controller('account/checkouts')
export class AccountCheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly carts: CartService,
    private readonly reservations: InventoryReservationService,
  ) {}

  @Post('quote')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'quoteAccountCheckout', summary: 'Revalidate an account cart and choose an eligible fulfillment branch' })
  @ApiCreatedResponse({ type: CheckoutQuoteDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  quote(
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Body() input: CreateCheckoutQuoteDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CheckoutQuoteDto> {
    const principal = getAuthPrincipal(request);
    return this.checkout.quoteAccount(principal.userId, input, idempotencyKey ?? '', requestId(request));
  }

  @Get(':checkoutToken')
  @ApiOperation({ operationId: 'getAccountCheckoutQuote', summary: 'Reload an owned account quote after staff consultation' })
  @ApiOkResponse({ type: CheckoutQuoteDto })
  getQuote(
    @Param('checkoutToken') checkoutToken: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CheckoutQuoteDto> {
    return this.checkout.getAccount(getAuthPrincipal(request).userId, checkoutToken);
  }

  @Post(':checkoutToken/confirm')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiOperation({ operationId: 'confirmAccountCheckout', summary: 'Confirm an account quote and reserve its physical SKU demand atomically' })
  @ApiCreatedResponse({ type: ReservationDto })
  async confirm(
    @Param('checkoutToken') checkoutToken: string,
    @Headers(IDEMPOTENCY_HEADER) idempotencyKey: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationDto> {
    const principal = getAuthPrincipal(request);
    const cartId = await this.carts.resolveAccountCartId(principal.userId);
    return this.reservations.confirm(checkoutToken, idempotencyKey ?? '', requestId(request), {
      actorType: 'USER',
      cartId,
      userId: principal.userId,
    });
  }

  @Post('reservations/:reservationToken/release')
  @ApiOperation({ operationId: 'releaseAccountReservation', summary: 'Release an account reservation before fulfillment handover' })
  @ApiOkResponse({ type: ReservationDto })
  async release(
    @Param('reservationToken') reservationToken: string,
    @Body() input: ReleaseReservationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationDto> {
    const principal = getAuthPrincipal(request);
    const cartId = await this.carts.resolveAccountCartId(principal.userId);
    return this.reservations.release(reservationToken, input.reason, requestId(request), undefined, {
      actorType: 'USER',
      cartId,
      userId: principal.userId,
    });
  }
}

@ApiTags('Admin Checkout')
@ApiBearerAuth()
@Controller('admin/checkouts')
export class AdminCheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Patch(':checkoutToken/shipping-consultation')
  @RequirePermissions('order.manage')
  @ApiOperation({ operationId: 'updateAdminManualShippingQuote', summary: 'Record an agreed manual/coach shipping fee and reopen the quote for customer confirmation' })
  @ApiOkResponse({ type: CheckoutQuoteDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  updateManualShipping(
    @Param('checkoutToken') checkoutToken: string,
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateManualShippingQuoteDto,
  ): Promise<CheckoutQuoteDto> {
    return this.checkout.updateManualShipping(checkoutToken, input, getAuthPrincipal(request), requestId(request));
  }
}
