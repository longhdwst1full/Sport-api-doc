import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { RequireAuthentication } from '../../common/decorators/require-authentication.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { USER_TYPE } from '../iam/iam.constants';
import { AuthService } from './auth.service';
import {
  CurrentUserDto,
  LoginDto,
  RefreshTokenDto,
  RegisterCustomerDto,
  TokenPairDto,
} from './auth.dto';
import type { AuthPrincipal } from './auth.types';

interface AuthenticatedRequest extends Request {
  auth?: AuthPrincipal;
}

@ApiTags('Admin Auth')
@Controller('admin/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'loginAdmin', summary: 'Authenticate staff by email or phone' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() input: LoginDto): Promise<TokenPairDto> {
    return this.auth.login(input, USER_TYPE.STAFF);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'refreshAdminToken', summary: 'Rotate a refresh token' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired, or reused refresh token' })
  refresh(@Body() input: RefreshTokenDto): Promise<TokenPairDto> {
    return this.auth.refresh(input.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'logoutAdmin', summary: 'Revoke a refresh token' })
  @ApiNoContentResponse()
  async logout(@Body() input: RefreshTokenDto): Promise<void> {
    await this.auth.logout(input.refreshToken);
  }

  @Get('me')
  @RequireAuthentication()
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getAdminCurrentUser', summary: 'Get verified user context' })
  @ApiOkResponse({ type: CurrentUserDto })
  @ApiUnauthorizedResponse()
  me(@Req() request: AuthenticatedRequest): CurrentUserDto {
    if (!request.auth) throw new Error('Authentication guard did not attach a principal');
    return {
      userId: request.auth.userId,
      displayName: request.auth.displayName,
      permissions: request.auth.permissions,
      scopes: request.auth.scopes,
    };
  }
}

@ApiTags('Storefront Auth')
@Controller('auth')
export class StorefrontAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'registerCustomer',
    summary: 'Register an active customer with email, phone, or both',
  })
  @ApiCreatedResponse({ type: TokenPairDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  register(
    @Body() input: RegisterCustomerDto,
    @Req() request: Request & { id?: string | number },
  ): Promise<TokenPairDto> {
    const requestId =
      request.id === undefined
        ? (request.header('x-request-id') ?? `registration-${randomUUID()}`)
        : String(request.id);
    return this.auth.registerCustomer(input, requestId);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'loginCustomer', summary: 'Authenticate customer by email or phone' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Invalid credentials' })
  login(@Body() input: LoginDto): Promise<TokenPairDto> {
    return this.auth.login(input, USER_TYPE.CUSTOMER);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'refreshCustomerToken', summary: 'Rotate a customer refresh token' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  refresh(@Body() input: RefreshTokenDto): Promise<TokenPairDto> {
    return this.auth.refresh(input.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'logoutCustomer', summary: 'Revoke a customer refresh token' })
  @ApiNoContentResponse()
  async logout(@Body() input: RefreshTokenDto): Promise<void> {
    await this.auth.logout(input.refreshToken);
  }

  @Get('me')
  @RequireAuthentication()
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getCustomerCurrentUser', summary: 'Get verified customer context' })
  @ApiOkResponse({ type: CurrentUserDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  me(@Req() request: AuthenticatedRequest): CurrentUserDto {
    if (!request.auth) throw new Error('Authentication guard did not attach a principal');
    return {
      userId: request.auth.userId,
      displayName: request.auth.displayName,
      permissions: request.auth.permissions,
      scopes: request.auth.scopes,
    };
  }
}
