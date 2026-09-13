import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  Max,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { AUTH_TOKEN_TRANSPORT, AuthTokenTransport } from '../modules/auth/auth.constants';

enum NodeEnvironment {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

enum AppMode {
  SERVE = 'serve',
  MIGRATE = 'migrate',
}

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true';

class EnvironmentVariables {
  @IsEnum(AppMode)
  APP_MODE: AppMode = AppMode.SERVE;

  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.DEVELOPMENT;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 4000;

  @IsString()
  CORS_ORIGINS = '*';

  @Transform(toBoolean)
  @IsBoolean()
  AUTH_BYPASS = false;

  @IsEnum(AUTH_TOKEN_TRANSPORT)
  AUTH_TOKEN_TRANSPORT: AuthTokenTransport = AUTH_TOKEN_TRANSPORT.BODY;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET = 'development-only-change-this-jwt-secret';

  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL_SECONDS = 900;

  @Type(() => Number)
  @IsInt()
  @Min(300)
  JWT_REFRESH_TTL_SECONDS = 2_592_000;

  @IsString()
  LOG_LEVEL = 'info';

  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  RATE_LIMIT_TTL_MS = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  RATE_LIMIT_MAX = 120;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1_440)
  CHECKOUT_RESERVATION_TTL_MINUTES = 30;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  ORDER_COMPLETION_HOLD_HOURS = 72;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1_440)
  PAYMENT_TIMEOUT_MINUTES = 30;

  @Transform(toBoolean)
  @IsBoolean()
  RESERVATION_EXPIRY_JOB_ENABLED = false;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  RESERVATION_EXPIRY_JOB_BATCH_SIZE = 50;

  @Transform(toBoolean)
  @IsBoolean()
  PAYMENT_EXPIRY_JOB_ENABLED = false;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  PAYMENT_EXPIRY_JOB_BATCH_SIZE = 50;

  @Transform(toBoolean)
  @IsBoolean()
  ORDER_COMPLETION_JOB_ENABLED = false;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  ORDER_COMPLETION_JOB_BATCH_SIZE = 50;

  @ValidateIf((environment: EnvironmentVariables) =>
    environment.RESERVATION_EXPIRY_JOB_ENABLED ||
    environment.PAYMENT_EXPIRY_JOB_ENABLED ||
    environment.ORDER_COMPLETION_JOB_ENABLED)
  @IsString()
  @MinLength(32)
  CRON_SECRET?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  GUEST_CART_TTL_DAYS = 30;

  @Type(() => Number)
  @Min(0)
  @Max(100)
  SHIPPING_FREE_RADIUS_KM = 10;

  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(30_000)
  SHIPPING_PROVIDER_TIMEOUT_MS = 5_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SHIPPING_SMALL_MAX_WEIGHT_GRAMS = 5_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS = 20_000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  SHIPPING_SMALL_FEE_VND = 50_000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  SHIPPING_MEDIUM_FEE_VND = 100_000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  SHIPPING_LARGE_FEE_VND = 200_000;

  @Transform(toBoolean)
  @IsBoolean()
  GHN_ENABLED = false;

  @ValidateIf((environment: EnvironmentVariables) => environment.GHN_ENABLED)
  @IsString()
  GHN_API_URL?: string;

  @ValidateIf((environment: EnvironmentVariables) => environment.GHN_ENABLED)
  @IsString()
  GHN_TOKEN?: string;

  @ValidateIf((environment: EnvironmentVariables) => environment.GHN_ENABLED)
  @Matches(/^\d+$/, { message: 'GHN_SHOP_ID must be numeric' })
  GHN_SHOP_ID?: string;

  @Transform(toBoolean)
  @IsBoolean()
  GHTK_ENABLED = false;

  @ValidateIf((environment: EnvironmentVariables) => environment.GHTK_ENABLED)
  @IsString()
  GHTK_API_URL?: string;

  @ValidateIf((environment: EnvironmentVariables) => environment.GHTK_ENABLED)
  @IsString()
  GHTK_TOKEN?: string;

  @Transform(toBoolean)
  @IsBoolean()
  DATABASE_ENABLED = false;

  @Transform(toBoolean)
  @IsBoolean()
  DB_MIGRATE_ON_START = true;

  @Transform(toBoolean)
  @IsBoolean()
  DB_MIGRATE_ON_DEPLOY = true;

  @ValidateIf((environment: EnvironmentVariables) => environment.DATABASE_ENABLED)
  @IsString()
  @Matches(/^postgres(?:ql)?:\/\//, { message: 'DATABASE_URL must be a PostgreSQL URL' })
  DATABASE_URL?: string;

  @ValidateIf((environment: EnvironmentVariables) => environment.DATABASE_ENABLED)
  @IsString()
  @Matches(/^postgres(?:ql)?:\/\//, { message: 'DIRECT_URL must be a PostgreSQL URL' })
  DIRECT_URL?: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_SECRET?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/, {
    message: 'CLOUDINARY_FOLDER must be a relative provider folder',
  })
  CLOUDINARY_FOLDER?: string;

  @Transform(toBoolean)
  @IsBoolean()
  TELEGRAM_BOT_ENABLED = false;

  @ValidateIf((environment: EnvironmentVariables) => environment.TELEGRAM_BOT_ENABLED)
  @IsString()
  @Matches(/^\d+:[A-Za-z0-9_-]+$/, { message: 'TELEGRAM_BOT_TOKEN is invalid' })
  TELEGRAM_BOT_TOKEN?: string;

  @ValidateIf((environment: EnvironmentVariables) => environment.TELEGRAM_BOT_ENABLED)
  @IsString()
  @Matches(/^[1-9]\d*$/, { message: 'TELEGRAM_ALLOWED_USER_ID must be a numeric user ID' })
  TELEGRAM_ALLOWED_USER_ID?: string;

  @ValidateIf((environment: EnvironmentVariables) => environment.TELEGRAM_BOT_ENABLED)
  @IsString()
  @MinLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'TELEGRAM_WEBHOOK_SECRET is invalid' })
  TELEGRAM_WEBHOOK_SECRET?: string;
}

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const environment = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(environment, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new Error(`Environment validation failed: ${messages.join('; ')}`);
  }
  if (environment.SHIPPING_SMALL_MAX_WEIGHT_GRAMS >= environment.SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS) {
    throw new Error(
      'Environment validation failed: SHIPPING_SMALL_MAX_WEIGHT_GRAMS must be less than SHIPPING_MEDIUM_MAX_WEIGHT_GRAMS',
    );
  }
  if (environment.NODE_ENV === NodeEnvironment.PRODUCTION) {
    if (environment.CORS_ORIGINS.split(',').some((origin) => origin.trim() === '*')) {
      throw new Error('Environment validation failed: CORS_ORIGINS cannot contain * in production');
    }
    if (environment.AUTH_BYPASS) {
      throw new Error('Environment validation failed: AUTH_BYPASS must be false in production');
    }
    if (environment.AUTH_TOKEN_TRANSPORT !== AUTH_TOKEN_TRANSPORT.COOKIE) {
      throw new Error(
        'Environment validation failed: AUTH_TOKEN_TRANSPORT must be COOKIE in production',
      );
    }
  }
  return { ...config, ...environment };
}
