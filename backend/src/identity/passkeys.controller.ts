import { Body, Controller, HttpCode, HttpException, HttpStatus, Post } from '@nestjs/common';
import { PasskeyLoginOptionsDto, PasskeyRegistrationOptionsDto, PasskeyVerifyDto } from './dto/passkey.dto.js';

function notImplemented(feature: string, todo: string[]): never {
  throw new HttpException(
    { statusCode: HttpStatus.NOT_IMPLEMENTED, error: 'Not Implemented', message: `${feature} is not implemented yet`, todo },
    HttpStatus.NOT_IMPLEMENTED,
  );
}

/**
 * Passkey (WebAuthn) sign-up and sign-in. Documented stubs: every route answers 501.
 *
 * Intended flow (TODO):
 *  - Use a maintained WebAuthn library (e.g. @simplewebauthn/server); never hand-roll
 *    attestation/assertion verification.
 *  - RP ID / name / origin come from WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME, WEBAUTHN_ORIGIN.
 *    Native apps additionally need the associated-domains / assetlinks files on the RP ID.
 *  - Challenges are random 32 bytes, single-use, stored in Redis with a 5 minute TTL and
 *    bound to the pending registration/login.
 *  - Verified credentials go to passkey_credentials (credential_id, COSE public_key,
 *    sign_count, transports, backup flags). Reject sign_count regressions where non-zero.
 *  - Successful verification calls SessionsService.issue() and returns the bearer token once.
 *  - Every outcome is audited (passkey.registered, session.created, login.failed).
 */
@Controller('auth/passkeys')
export class PasskeysController {
  @Post('register/options')
  @HttpCode(HttpStatus.OK)
  registrationOptions(@Body() _dto: PasskeyRegistrationOptionsDto) {
    notImplemented('Passkey registration', [
      'Generate PublicKeyCredentialCreationOptions (residentKey: required, userVerification: preferred)',
      'Store the challenge in Redis (5 min TTL)',
    ]);
  }

  @Post('register/verify')
  @HttpCode(HttpStatus.OK)
  registrationVerify(@Body() _dto: PasskeyVerifyDto) {
    notImplemented('Passkey registration', [
      'Verify attestation against the stored challenge, RP ID and origin',
      'Create the user (if new) and insert passkey_credentials',
      'Issue a session',
    ]);
  }

  @Post('login/options')
  @HttpCode(HttpStatus.OK)
  loginOptions(@Body() _dto: PasskeyLoginOptionsDto) {
    notImplemented('Passkey sign-in', [
      'Generate PublicKeyCredentialRequestOptions (discoverable credentials, no allowCredentials needed)',
      'Store the challenge in Redis (5 min TTL)',
    ]);
  }

  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  loginVerify(@Body() _dto: PasskeyVerifyDto) {
    notImplemented('Passkey sign-in', [
      'Look up passkey_credentials by rawId and verify the assertion signature',
      'Update sign_count / last_used_at, issue a session, audit the sign-in',
    ]);
  }
}
