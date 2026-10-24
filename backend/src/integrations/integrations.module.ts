import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';

/**
 * Third-party platforms. Today: the capability matrix only.
 * TODO: OAuth connect/callback/revoke for email (Gmail, Microsoft) storing only token
 * references and KMS-encrypted refresh tokens in integration_accounts, with consent_records.
 */
@Module({
  controllers: [IntegrationsController],
})
export class IntegrationsModule {}
