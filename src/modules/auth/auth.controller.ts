import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireAuthentication } from '../../common/decorators/require-authentication.decorator';
import { AuthService } from './auth.service';
import { CurrentUserDto, LoginDto, RefreshTokenDto, TokenPairDto } from './auth.dto';
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
  @ApiOperation({ operationId: 'loginAdmin', summary: 'Authenticate an admin user' })
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(@Body() input: LoginDto): Promise<TokenPairDto> {
    return this.auth.login(input);
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
