import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiAcceptedResponse,
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
  ForgotPasswordDto,
  ResetPasswordDto,
  CurrentUserDto,
  LoginDto,
  RefreshTokenDto,
  RegisterCustomerDto,
  TokenPairDto,
} from './auth.dto';
import type { AuthPrincipal } from './auth.types';
import { AuthTokenTransportService } from './auth-token-transport.service';
import { PasswordResetService } from './password-reset.service';

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
  /**
   * SECURITY: khóa tài khoản sau 5 lần sai chỉ chặn tấn công vào MỘT tài khoản. Hạn mức theo IP
   * chặn hướng còn lại — rải mật khẩu phổ biến qua nhiều tài khoản khác nhau, nơi không tài khoản
   * nào đủ số lần sai để bị khóa. Hạn mức này chỉ có tác dụng khi `TRUST_PROXY` được đặt đúng,
   * nếu không mọi người dùng chung một rổ đếm là IP của proxy.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ operationId: 'loginAdmin', summary: 'Authenticate staff by email or phone' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Invalid credentials, or ACCOUNT_LOCKED after five failed attempts',
  })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPairDto> {
    const pair = await this.auth.login(input, USER_TYPE.STAFF, this.requestId(request));
    return this.transport.deliver(pair, response, 'admin', input.rememberMe ?? false);
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
    return this.transport.deliver(
      pair,
      response,
      'admin',
      this.transport.isRemembered(request, 'admin'),
    );
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
      permissionVersion: request.auth.permissionVersion,
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
    private readonly passwordReset: PasswordResetService,
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
    const pair = await this.auth.registerCustomer(input, this.requestId(request, 'registration'));
    return this.transport.deliver(pair, response, 'customer');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  /**
   * SECURITY: khóa tài khoản sau 5 lần sai chỉ chặn tấn công vào MỘT tài khoản. Hạn mức theo IP
   * chặn hướng còn lại — rải mật khẩu phổ biến qua nhiều tài khoản khác nhau, nơi không tài khoản
   * nào đủ số lần sai để bị khóa. Hạn mức này chỉ có tác dụng khi `TRUST_PROXY` được đặt đúng,
   * nếu không mọi người dùng chung một rổ đếm là IP của proxy.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ operationId: 'loginCustomer', summary: 'Authenticate customer by email or phone' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Invalid credentials, or ACCOUNT_LOCKED after five failed attempts',
  })
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPairDto> {
    const pair = await this.auth.login(input, USER_TYPE.CUSTOMER, this.requestId(request));
    return this.transport.deliver(pair, response, 'customer', input.rememberMe ?? false);
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
    return this.transport.deliver(
      pair,
      response,
      'customer',
      this.transport.isRemembered(request, 'customer'),
    );
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

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'requestCustomerPasswordReset',
    summary: 'Gửi email đặt lại mật khẩu',
    description:
      'Luôn trả 202 dù email có tồn tại hay không: trả lời khác nhau biến endpoint này thành công '
      + 'cụ dò xem ai có tài khoản ở đây.',
  })
  @ApiAcceptedResponse()
  async forgotPassword(
    @Body() input: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    await this.passwordReset.requestReset(
      input,
      this.requestId(request, 'password-reset'),
      PasswordResetService.hashIp(request.ip),
    );
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    operationId: 'resetCustomerPassword',
    summary: 'Đặt lại mật khẩu bằng token trong email',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Token sai, đã dùng hoặc hết hạn — cả ba trả về cùng một thông báo',
  })
  async resetPassword(@Body() input: ResetPasswordDto, @Req() request: Request): Promise<void> {
    await this.passwordReset.resetPassword(input, this.requestId(request, 'password-reset'));
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireAuthentication()
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'changeCustomerPassword',
    summary: 'Khách đang đăng nhập tự đổi mật khẩu',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Mật khẩu hiện tại sai, hoặc mật khẩu mới trùng mật khẩu cũ',
  })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  async changePassword(
    @Body() input: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    if (!request.auth) throw new Error('Authentication guard did not attach a principal');
    // Dùng chung use case với nhân viên: quy tắc mật khẩu, khoá tài khoản và thu hồi phiên phải
    // giống nhau cho mọi loại tài khoản, nếu không sẽ có một đường yếu hơn đường kia.
    await this.auth.changePassword(request.auth, input, this.requestId(request));
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
      permissionVersion: request.auth.permissionVersion,
      mustChangePassword: request.auth.mustChangePassword,
    };
  }

  /**
   * Request ID để nối audit với một lượt gọi cụ thể; thiếu thì sinh tạm để audit không rỗng.
   *
   * Ba chỗ trong controller này từng lặp lại đúng đoạn trên, mỗi chỗ một tiền tố khác nhau.
   */
  private requestId(request: Request, prefix = 'auth'): string {
    return typeof request.id === 'string' || typeof request.id === 'number'
      ? String(request.id)
      : (request.header('x-request-id') ?? `${prefix}-${randomUUID()}`);
  }
}
