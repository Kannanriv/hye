import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { AppConfig } from '../config/app-config.module.js';
import { newId } from '../common/ids.js';
import type { PrivacyRequestKind, PrivacyRequestRecord } from '../persistence/records.js';
import { PRIVACY_REPOSITORY, type PrivacyRepository } from './privacy.repository.js';

export function privacyRequestView(r: PrivacyRequestRecord) {
  return {
    id: r.id, kind: r.kind, status: r.status, scheduledFor: r.scheduledFor ?? undefined,
    completedAt: r.completedAt ?? undefined, createdAt: r.createdAt,
  };
}

/**
 * Data export and account deletion requests (GDPR/CCPA-style). Requests are recorded and
 * audited here; the work itself belongs to background jobs (TODO):
 *  - export: collect the user's data into an archive in S3, notify, expire the link;
 *  - deletion: after the grace period, revoke sessions/integrations, delete owned content
 *    and media, anonymize audit rows, then delete the user.
 */
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(PRIVACY_REPOSITORY) private readonly repo: PrivacyRepository,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  /** Idempotent: an open request of the same kind is returned instead of a new one. */
  async requestExport(userId: string): Promise<{ request: PrivacyRequestRecord; created: boolean }> {
    return this.open(userId, 'export', null);
  }

  async requestDeletion(userId: string, reason?: string): Promise<{ request: PrivacyRequestRecord; created: boolean }> {
    const graceMs = this.config.get('ACCOUNT_DELETION_GRACE_DAYS') * 86_400_000;
    const result = await this.open(userId, 'deletion', new Date(Date.now() + graceMs).toISOString(), reason);
    return result;
  }

  async cancelDeletion(userId: string): Promise<PrivacyRequestRecord> {
    const open = await this.repo.findOpen(userId, 'deletion');
    if (!open) throw new NotFoundException('No pending deletion request');
    const cancelled = { ...open, status: 'cancelled' as const, updatedAt: new Date().toISOString() };
    await this.repo.update(cancelled);
    await this.audit.record({ userId, action: 'privacy.deletion_cancelled', targetType: 'privacy_request', targetId: open.id });
    return cancelled;
  }

  async get(userId: string, id: string): Promise<PrivacyRequestRecord> {
    const r = await this.repo.findById(id);
    if (!r || r.userId !== userId) throw new NotFoundException('Request not found');
    return r;
  }

  private async open(userId: string, kind: PrivacyRequestKind, scheduledFor: string | null, reason?: string) {
    const existing = await this.repo.findOpen(userId, kind);
    if (existing) return { request: existing, created: false };
    const now = new Date().toISOString();
    const request: PrivacyRequestRecord = {
      id: newId(), userId, kind, status: 'pending', scheduledFor, completedAt: null, createdAt: now, updatedAt: now,
    };
    await this.repo.insert(request);
    await this.audit.record({
      userId, action: `privacy.${kind}_requested`, targetType: 'privacy_request', targetId: request.id,
      detail: scheduledFor ? `scheduled for ${scheduledFor}` : '', metadata: reason ? { reason } : {},
    });
    return { request, created: true };
  }
}
