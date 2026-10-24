import { Body, Controller, HttpCode, HttpException, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppConfig } from '../config/app-config.module.js';
import { OtpRequestDto, OtpVerifyDto } from './dto/otp.dto.js';

/**
 * Phone sign-in with a one-time code. Documented stubs: both routes answer 501 and no SMS
 * is ever sent. With SMS_PROVIDER=none (the only supported value today) nothing leaves the
 * server, in any environment.
 *
 * Intended flow (TODO):
 *  request:
 *   - Normalize the number (libphonenumber), reject premium-rate / unsupported regions.
 *   - Rate-limit per phone, per IP and per device (Redis), with exponential back-off, to stop
 *     SMS pumping; keep this route on a tight throttle.
 *   - Generate a 6-digit code with crypto.randomInt, store HMAC-SHA-256(code) in
 *     otp_challenges (5 min expiry, max 5 attempts), send through the configured provider
 *     adapter (e.g. Twilio Verify / MessageBird), return { challengeId, expiresAt }.
 *   - Always answer the same way whether or not the number has an account (no enumeration).
 *  verify:
 *   - Constant-time compare of the HMAC; count attempts; consume on success.
 *   - Find or create the user by phone (set phone_verified_at), issue a session via
 *     SessionsService.issue(), audit auth.otp_verified / session.created.
 */
@Controller('auth/otp')
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class OtpController {
  constructor(private readonly config: AppConfig) {}

  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  request(@Body() _dto: OtpRequestDto) {
    this.notImplemented('Sending sign-in codes', [
      'Add an SMS provider adapter and select it with SMS_PROVIDER',
      'Store HMAC(code) in otp_challenges with expiry and attempt limits',
      'Rate-limit per phone / IP / device in Redis',
    ]);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() _dto: OtpVerifyDto) {
    this.notImplemented('Verifying sign-in codes', [
      'Check the challenge (not expired, not consumed, attempts left) and compare HMACs in constant time',
      'Find or create the user by phone, set phone_verified_at, issue a session',
    ]);
  }

  private notImplemented(feature: string, todo: string[]): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.NOT_IMPLEMENTED,
        error: 'Not Implemented',
        message: `${feature} is not implemented yet. No SMS was sent.`,
        smsProvider: this.config.get('SMS_PROVIDER'),
        todo,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
