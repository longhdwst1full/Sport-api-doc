import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';

enum NodeEnvironment {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true';

class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.DEVELOPMENT;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  PORT = 4000;

  @IsString()
  CORS_ORIGINS = 'http://localhost:3000,http://localhost:5173';

  @Transform(toBoolean)
  @IsBoolean()
  AUTH_BYPASS = false;

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

  @Transform(toBoolean)
  @IsBoolean()
  DATABASE_ENABLED = false;

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
  return { ...config, ...environment };
}
