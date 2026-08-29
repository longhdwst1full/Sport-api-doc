import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ format: 'password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  refreshToken: string;
}

export class TokenPairDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
  @ApiProperty({ example: 900 }) expiresIn: number;
}

export class AuthScopeDto {
  @ApiProperty({ enum: ['GLOBAL', 'BRANCH'] }) type: 'GLOBAL' | 'BRANCH';
  @ApiProperty({ required: false, format: 'uuid' }) branchId?: string;
}

export class CurrentUserDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() displayName: string;
  @ApiProperty({ type: [String] }) permissions: string[];
  @ApiProperty({ type: [AuthScopeDto] }) scopes: AuthScopeDto[];
}
