import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, Max, Min, MinLength, ValidateIf, validateSync,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()) : value;

/**
 * Every environment variable the server reads. Validated once at boot; the process
 * refuses to start on invalid configuration. See .env.example for documentation.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @IsInt() @Min(1) @Max(65535)
  PORT = 3000;

  @IsIn(['fatal', 'error', 'warn', 'log', 'debug', 'verbose'])
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'log' | 'debug' | 'verbose' = 'log';

  /** memory = in-process repositories (dev/test); postgres = DATABASE_URL-backed where implemented. */
  @IsIn(['memory', 'postgres'])
  PERSISTENCE: 'memory' | 'postgres' = 'memory';

  @ValidateIf((o: EnvironmentVariables) => o.PERSISTENCE === 'postgres' || o.DATABASE_URL !== undefined)
  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL?: string;

  @IsInt() @Min(1) @Max(200)
  DATABASE_POOL_MAX = 10;

  @IsOptional() @IsUrl({ protocols: ['redis', 'rediss'], require_tld: false })
  REDIS_URL?: string;

  @IsOptional() @IsUrl({ require_tld: false })
  S3_ENDPOINT?: string;
  @IsOptional() @IsString()
  S3_REGION?: string;
  @IsOptional() @IsString()
  S3_BUCKET?: string;
  @IsOptional() @IsString()
  S3_ACCESS_KEY?: string;
  @IsOptional() @IsString()
  S3_SECRET_KEY?: string;

  @ValidateIf((o: EnvironmentVariables) => o.NODE_ENV === 'production' || o.JWT_SECRET !== undefined)
  @IsString() @MinLength(32)
  JWT_SECRET?: string;

  @ValidateIf((o: EnvironmentVariables) => o.NODE_ENV === 'production' || o.SESSION_SECRET !== undefined)
  @IsString() @MinLength(32)
  SESSION_SECRET?: string;

  @IsInt() @Min(1)
  SESSION_TTL_DAYS = 30;

  /**
   * SMS provider for sign-in codes. Only 'none' exists today: OTP endpoints are stubs and
   * never send SMS. Add provider adapters (and their credentials) before allowing others.
   */
  @IsIn(['none'])
  SMS_PROVIDER: 'none' = 'none';

  @IsString()
  WEBAUTHN_RP_ID = 'localhost';
  @IsString()
  WEBAUTHN_RP_NAME = 'hye';
  @IsString()
  WEBAUTHN_ORIGIN = 'http://localhost:8081';

  /** Comma-separated list of allowed browser origins. Empty = CORS disabled. */
  @IsString()
  CORS_ORIGINS = '';

  @IsInt() @Min(1) @Max(2048)
  MAX_UPLOAD_MB = 50;

  @IsOptional() @IsString()
  CLAMAV_HOST?: string;
  @IsInt() @Min(1) @Max(65535)
  CLAMAV_PORT = 3310;

  @IsInt() @Min(1) @Max(10_000)
  IMPORT_BATCH_SIZE = 200;
  /** Batches processed inline per HTTP request; the rest waits for POST /imports/:id/resume. */
  @IsInt() @Min(1)
  IMPORT_MAX_BATCHES_PER_REQUEST = 50;

  @IsInt() @Min(1)
  ACCOUNT_DELETION_GRACE_DAYS = 30;

  @IsInt() @Min(1000)
  THROTTLE_TTL_MS = 60_000;
  @IsInt() @Min(1)
  THROTTLE_LIMIT = 120;

  /**
   * Development-only: accept `x-hye-dev-user: <uuid>` instead of a session token,
   * until passkey login is implemented. Rejected at boot when NODE_ENV=production.
   */
  @Transform(toBool) @IsBoolean()
  AUTH_DEV_HEADER = false;

  @IsInt() @Min(0)
  SHUTDOWN_TIMEOUT_MS = 10_000;
}

const NUMERIC_KEYS = new Set([
  'PORT', 'DATABASE_POOL_MAX', 'SESSION_TTL_DAYS', 'MAX_UPLOAD_MB', 'CLAMAV_PORT', 'IMPORT_BATCH_SIZE',
  'IMPORT_MAX_BATCHES_PER_REQUEST', 'ACCOUNT_DELETION_GRACE_DAYS', 'THROTTLE_TTL_MS', 'THROTTLE_LIMIT',
  'SHUTDOWN_TIMEOUT_MS',
]);

export function validateEnv(raw: Record<string, unknown>): EnvironmentVariables {
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === '' && key !== 'CORS_ORIGINS') continue; // treat empty as unset
    input[key] = NUMERIC_KEYS.has(key) && typeof value === 'string' ? Number(value) : value;
  }
  const config = plainToInstance(EnvironmentVariables, input, { exposeDefaultValues: true });
  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });
  if (config.NODE_ENV === 'production' && config.AUTH_DEV_HEADER) {
    throw new Error('Invalid environment: AUTH_DEV_HEADER must not be enabled in production');
  }
  if (errors.length) {
    const details = errors.map(e => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('; ');
    throw new Error(`Invalid environment: ${details}`);
  }
  return config;
}
