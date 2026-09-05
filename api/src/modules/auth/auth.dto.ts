import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'owner@example.com',
    description: 'Email or Vietnamese phone number',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  identifier: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    description: 'Leading and trailing whitespace is ignored',
  })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class RegisterCustomerDto {
  @ApiProperty({ example: 'Nguyễn Minh Anh', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @ApiPropertyOptional({ example: 'minh.anh@example.com', maxLength: 255 })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    example: '0912 345 678',
    maxLength: 32,
    description: 'Vietnamese phone; stored in E.164 format',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    description: 'Leading and trailing whitespace is ignored',
  })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Required in BODY transport; omitted when the refresh token is in HttpOnly cookie',
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  refreshToken?: string;
}

export class TokenPairDto {
  @ApiProperty() accessToken: string;
  @ApiPropertyOptional({
    description: 'Returned only in BODY transport; COOKIE transport uses an HttpOnly cookie',
  })
  refreshToken?: string;
  @ApiProperty({ example: 'Bearer' }) tokenType: 'Bearer';
  @ApiProperty({ example: 900 }) expiresIn: number;
  @ApiProperty({ example: false }) mustChangePassword: boolean;
}

export class ChangePasswordDto {
  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    description: 'Leading and trailing whitespace is ignored',
  })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    description: 'Leading and trailing whitespace is ignored',
  })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
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
  @ApiProperty({ example: false }) mustChangePassword: boolean;
}
