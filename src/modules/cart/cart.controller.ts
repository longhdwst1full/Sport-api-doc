import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequireAuthentication } from '../../common/decorators/require-authentication.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { AuthenticatedRequest, getAuthPrincipal } from '../../common/request/request-context';
import { CART_HEADER } from './cart.constants';
import { CartDto, GuestCartDto, MutateCartDto, SetCartItemDto, UpdateCartItemDto } from './cart.dto';
import { CartService } from './cart.service';

const guestTokenHeader = {
  name: CART_HEADER.GUEST_TOKEN,
  required: true,
  description: 'Opaque guest cart token returned only when the cart is created',
};

@ApiTags('Storefront Guest Cart')
@Controller('carts/guest')
export class GuestCartController {
  constructor(private readonly carts: CartService) {}

  @Post()
  @ApiOperation({ operationId: 'createGuestCart', summary: 'Create an anonymous server-side cart' })
  @ApiCreatedResponse({ type: GuestCartDto })
  create(): Promise<GuestCartDto> {
    return this.carts.createGuest();
  }

  @Get()
  @ApiHeader(guestTokenHeader)
  @ApiOperation({ operationId: 'getGuestCart', summary: 'Get the active anonymous cart' })
  @ApiOkResponse({ type: CartDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  get(@Headers(CART_HEADER.GUEST_TOKEN) token = ''): Promise<CartDto> {
    return this.carts.getGuest(token);
  }

  @Post('items')
  @ApiHeader(guestTokenHeader)
  @ApiOperation({ operationId: 'setGuestCartItem', summary: 'Set quantity for a variant in the guest cart' })
  @ApiOkResponse({ type: CartDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  setItem(
    @Headers(CART_HEADER.GUEST_TOKEN) token = '',
    @Body() input: SetCartItemDto,
  ): Promise<CartDto> {
    return this.carts.setGuestItem(
      token,
      input.productVariantId,
      input.quantity,
      input.expectedCartVersion,
    );
  }

  @Patch('items/:itemId')
  @ApiHeader(guestTokenHeader)
  @ApiOperation({ operationId: 'updateGuestCartItem', summary: 'Update a guest cart item quantity' })
  @ApiOkResponse({ type: CartDto })
  updateItem(
    @Headers(CART_HEADER.GUEST_TOKEN) token = '',
    @Param('itemId') itemId: string,
    @Body() input: UpdateCartItemDto,
  ): Promise<CartDto> {
    return this.carts.updateGuestItem(token, itemId, input.quantity, input.expectedCartVersion);
  }

  @Delete('items/:itemId')
  @ApiHeader(guestTokenHeader)
  @ApiOperation({ operationId: 'removeGuestCartItem', summary: 'Remove an item from the guest cart' })
  @ApiOkResponse({ type: CartDto })
  removeItem(
    @Headers(CART_HEADER.GUEST_TOKEN) token = '',
    @Param('itemId') itemId: string,
    @Body() input: MutateCartDto,
  ): Promise<CartDto> {
    return this.carts.removeGuestItem(token, itemId, input.expectedCartVersion);
  }
}

@ApiTags('Storefront Account Cart')
@ApiBearerAuth()
@RequireAuthentication()
@Controller('account/cart')
export class AccountCartController {
  constructor(private readonly carts: CartService) {}

  @Get()
  @ApiOperation({ operationId: 'getAccountCart', summary: 'Get or create the signed-in customer cart' })
  @ApiOkResponse({ type: CartDto })
  get(@Req() request: AuthenticatedRequest): Promise<CartDto> {
    return this.carts.getOrCreateAccount(getAuthPrincipal(request).userId);
  }

  @Post('items')
  @ApiOperation({ operationId: 'setAccountCartItem', summary: 'Set quantity for a variant in the account cart' })
  @ApiOkResponse({ type: CartDto })
  setItem(@Req() request: AuthenticatedRequest, @Body() input: SetCartItemDto): Promise<CartDto> {
    return this.carts.setAccountItem(
      getAuthPrincipal(request).userId,
      input.productVariantId,
      input.quantity,
      input.expectedCartVersion,
    );
  }

  @Patch('items/:itemId')
  @ApiOperation({ operationId: 'updateAccountCartItem', summary: 'Update an account cart item quantity' })
  @ApiOkResponse({ type: CartDto })
  updateItem(
    @Req() request: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() input: UpdateCartItemDto,
  ): Promise<CartDto> {
    return this.carts.updateAccountItem(
      getAuthPrincipal(request).userId,
      itemId,
      input.quantity,
      input.expectedCartVersion,
    );
  }

  @Delete('items/:itemId')
  @ApiOperation({ operationId: 'removeAccountCartItem', summary: 'Remove an item from the account cart' })
  @ApiOkResponse({ type: CartDto })
  removeItem(
    @Req() request: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() input: MutateCartDto,
  ): Promise<CartDto> {
    return this.carts.removeAccountItem(
      getAuthPrincipal(request).userId,
      itemId,
      input.expectedCartVersion,
    );
  }
}
