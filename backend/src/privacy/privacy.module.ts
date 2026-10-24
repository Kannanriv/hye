import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { PrivacyController } from './privacy.controller.js';
import { InMemoryPrivacyRepository, PRIVACY_REPOSITORY } from './privacy.repository.js';
import { PrivacyService } from './privacy.service.js';

/**
 * Data subject requests: export and account deletion.
 * TODO: Postgres repository (privacy_requests), consent_records endpoints, and the workers.
 */
@Module({
  imports: [IdentityModule],
  controllers: [PrivacyController],
  providers: [PrivacyService, { provide: PRIVACY_REPOSITORY, useClass: InMemoryPrivacyRepository }],
})
export class PrivacyModule {}
