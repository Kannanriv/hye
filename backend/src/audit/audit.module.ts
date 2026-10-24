import { Global, Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { AuditController } from './audit.controller.js';
import { AUDIT_REPOSITORY, InMemoryAuditRepository } from './audit.repository.js';
import { AuditService } from './audit.service.js';

/**
 * Audit trail. Global so any module can record events without importing it.
 * TODO: Postgres implementation of AuditRepository (INSERT-only grant on audit_events).
 */
@Global()
@Module({
  imports: [IdentityModule],
  controllers: [AuditController],
  providers: [AuditService, { provide: AUDIT_REPOSITORY, useClass: InMemoryAuditRepository }],
  exports: [AuditService],
})
export class AuditModule {}
