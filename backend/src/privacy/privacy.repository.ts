import { Injectable } from '@nestjs/common';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { PrivacyRequestKind, PrivacyRequestRecord } from '../persistence/records.js';

export const PRIVACY_REPOSITORY = Symbol('PRIVACY_REPOSITORY');

export interface PrivacyRepository {
  /** The pending/processing request of this kind, if any (at most one; see privacy_requests_open_uniq). */
  findOpen(userId: string, kind: PrivacyRequestKind): Promise<PrivacyRequestRecord | null>;
  findById(id: string): Promise<PrivacyRequestRecord | null>;
  insert(request: PrivacyRequestRecord): Promise<void>;
  update(request: PrivacyRequestRecord): Promise<void>;
}

@Injectable()
export class InMemoryPrivacyRepository implements PrivacyRepository {
  constructor(private readonly db: InMemoryDb) {}

  async findOpen(userId: string, kind: PrivacyRequestKind) {
    for (const r of this.db.privacyRequests.values()) {
      if (r.userId === userId && r.kind === kind && (r.status === 'pending' || r.status === 'processing')) return { ...r };
    }
    return null;
  }

  async findById(id: string) {
    const r = this.db.privacyRequests.get(id);
    return r ? { ...r } : null;
  }

  async insert(request: PrivacyRequestRecord) {
    this.db.privacyRequests.set(request.id, { ...request });
  }

  async update(request: PrivacyRequestRecord) {
    this.db.privacyRequests.set(request.id, { ...request });
  }
}
