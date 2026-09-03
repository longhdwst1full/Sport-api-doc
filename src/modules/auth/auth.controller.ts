import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
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
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequireAuthentication } from '../../common/decorators/require-authentication.decorator';
import { ErrorResponseDto } from '../../common/exceptions/error-response.dto';
import { USER_TYPE } from '../iam/iam.constants';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  CurrentUserDto,
  LoginDto,
  RefreshTokenDto,
  RegisterCustomerDto,
  TokenPairDto,
} from './auth.dto';
import type { AuthPrincipal } from './auth.types';
import { AuthTokenTransportService } from './auth-token-transport.service';

interface AuthenticatedRequest extends Request {
  auth?: AuthPrincipal;
}

@ApiTags('Admin Auth')
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly transport: AuthTokenTransportService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'loginAdmin', summary: 'Authenticate staff by email or phone' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPairDto> {
    const pair = await this.auth.login(input, USER_TYPE.STAFF, this.requestId(request));
    return this.transport.deliver(pair, response, 'admin');
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'refreshAdminToken', summary: 'Rotate a refresh token' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ description: 'Invalid, expired, or reused refresh token' })
  async refresh(
    @Body() input: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPairDto> {
    const pair = await this.auth.refresh(this.transport.readRefreshToken(request, input, 'admin'));
    return this.transport.deliver(pair, response, 'admin');
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'logoutAdmin', summary: 'Revoke a refresh token' })
  @ApiNoContentResponse()
  async logout(
    @Body() input: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.transport.readRefreshToken(request, input, 'admin'));
    this.transport.clear(response, 'admin');
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAuthentication()
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'changeAdminPassword',
    summary: 'Change the current staff password and clear mandatory password change',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async changePassword(
    @Body() input: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    if (!request.auth) throw new Error('Authentication guard did not attach a principal');
    await this.auth.changePassword(request.auth, input, this.requestId(request));
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
      mustChangePassword: request.auth.mustChangePassword,
    };
  }

  private requestId(request: Request): string {
    return typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : (request.header('x-request-id') ?? `auth-${randomUUID()}`);
  }
}

@ApiTags('Storefront Auth')
@Controller('auth')
export class StorefrontAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly transport: AuthTokenTransportService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'registerCustomer',
    summary: 'Register an active customer with email, phone, or both',
  })
  @ApiCreatedResponse({ type: TokenPairDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async register(
    @Body() input: RegisterCustomerDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPairDto> {
    const requestId =
      typeof request.id === 'string' || typeof request.id === 'number'
        ? String(request.id)
        : (request.header('x-request-id') ?? `registration-${randomUUID()}`);
    const pair = await this.auth.registerCustomer(input, requestId);
    return this.transport.deliver(pair, response, 'customer');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'loginCustomer', summary: 'Authenticate customer by email or phone' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Invalid credentials' })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPairDto> {
    const requestId = typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : (request.header('x-request-id') ?? `auth-${randomUUID()}`);
    const pair = await this.auth.login(input, USER_TYPE.CUSTOMER, requestId);
    return this.transport.deliver(pair, response, 'customer');
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'refreshCustomerToken', summary: 'Rotate a customer refresh token' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async refresh(
    @Body() input: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPairDto> {
    const pair = await this.auth.refresh(
      this.transport.readRefreshToken(request, input, 'customer'),
    );
    return this.transport.deliver(pair, response, 'customer');
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'logoutCustomer', summary: 'Revoke a customer refresh token' })
  @ApiNoContentResponse()
  async logout(
    @Body() input: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.transport.readRefreshToken(request, input, 'customer'));
    this.transport.clear(response, 'customer');
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
      mustChangePassword: request.auth.mustChangePassword,
    };
  }
}
