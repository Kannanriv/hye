import { Inject, Injectable, Logger } from '@nestjs/common';
import { newId, nowIso } from '../common/ids.js';
import type { AuditEventRecord } from '../persistence/records.js';
import { AUDIT_REPOSITORY, type AuditRepository } from './audit.repository.js';

export interface AuditInput {
  /** Whose data the event concerns. */
  userId: string | null;
  /** Who did it; defaults to userId. Null = system. */
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records security- and privacy-relevant actions (sign-ins, session revocation, imports,
 * export/deletion requests). Never put message content or secrets in detail/metadata.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(@Inject(AUDIT_REPOSITORY) private readonly repo: AuditRepository) {}

  async record(input: AuditInput): Promise<AuditEventRecord> {
    const event: AuditEventRecord = {
      id: newId(),
      userId: input.userId,
      actorUserId: input.actorUserId === undefined ? input.userId : input.actorUserId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      detail: input.detail ?? '',
      metadata: input.metadata ?? {},
      createdAt: nowIso(),
    };
    try {
      await this.repo.append(event);
    } catch (err) {
      // Auditing must not take the request down, but a failure has to be visible.
      this.logger.error({ msg: 'failed to write audit event', action: event.action, err: String(err) });
    }
    return event;
  }

  list(userId: string, limit = 100): Promise<AuditEventRecord[]> {
    return this.repo.listForUser(userId, Math.min(Math.max(limit, 1), 500));
  }
}
