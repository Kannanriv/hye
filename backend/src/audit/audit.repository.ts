import { Injectable } from '@nestjs/common';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { AuditEventRecord } from '../persistence/records.js';

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

/** Append-only store for audit_events. */
export interface AuditRepository {
  append(event: AuditEventRecord): Promise<void>;
  listForUser(userId: string, limit: number): Promise<AuditEventRecord[]>;
}

@Injectable()
export class InMemoryAuditRepository implements AuditRepository {
  constructor(private readonly db: InMemoryDb) {}

  async append(event: AuditEventRecord): Promise<void> {
    this.db.auditEvents.push(event);
  }

  async listForUser(userId: string, limit: number): Promise<AuditEventRecord[]> {
    return this.db.auditEvents.filter(e => e.userId === userId).reverse().slice(0, limit);
  }
}
