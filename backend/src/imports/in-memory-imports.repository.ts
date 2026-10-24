import { Injectable } from '@nestjs/common';
import type { SourcePlatform } from '../common/domain.js';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { ConversationRecord, ImportItemRecord, ImportJobRecord, MessageRecord } from '../persistence/records.js';
import { DuplicateImportError, type ImportsRepository, type ImportsStore, type ItemOutcomeUpdate } from './imports.repository.js';

const clone = <T>(v: T): T => structuredClone(v);

/**
 * In-memory ImportsRepository over InMemoryDb. transaction() snapshots and restores all
 * tables on error, so tests observe the same all-or-nothing batches as Postgres.
 */
@Injectable()
export class InMemoryImportsRepository implements ImportsRepository {
  constructor(protected readonly db: InMemoryDb) {}

  transaction<T>(fn: (store: ImportsStore) => Promise<T>): Promise<T> {
    return this.db.transaction(() => fn(this));
  }

  async findJobByFileHash(ownerUserId: string, platform: SourcePlatform, fileHash: string) {
    for (const j of this.db.importJobs.values()) {
      if (j.ownerUserId === ownerUserId && j.platform === platform && j.fileHash === fileHash) return clone(j);
    }
    return null;
  }

  async getJob(jobId: string) {
    const j = this.db.importJobs.get(jobId);
    return j ? clone(j) : null;
  }

  async insertJob(job: ImportJobRecord) {
    if (await this.findJobByFileHash(job.ownerUserId, job.platform, job.fileHash)) throw new DuplicateImportError();
    this.db.importJobs.set(job.id, clone(job));
    this.db.importItems.set(job.id, []);
  }

  async updateJob(job: ImportJobRecord) {
    if (!this.db.importJobs.has(job.id)) throw new Error(`import job ${job.id} not found`);
    this.db.importJobs.set(job.id, clone(job));
  }

  async getConversation(conversationId: string) {
    const c = this.db.conversations.get(conversationId);
    return c && !c.deletedAt ? clone(c) : null;
  }

  async isConversationMember(conversationId: string, userId: string) {
    return !!this.db.members.get(conversationId)?.some(m => m.userId === userId && !m.leftAt);
  }

  async insertImportedConversation(conversation: ConversationRecord, ownerUserId: string) {
    this.db.conversations.set(conversation.id, clone(conversation));
    this.db.members.set(conversation.id, [{
      conversationId: conversation.id, userId: ownerUserId, role: 'admin', pinned: false, muted: false,
      archived: false, markedUnread: false, lastReadAt: conversation.createdAt,
      lastActivityAt: conversation.lastActivityAt, joinedAt: conversation.createdAt, leftAt: null,
    }]);
  }

  async linkConversationToJob(conversationId: string, jobId: string) {
    const c = this.db.conversations.get(conversationId);
    if (c?.provenance && !c.provenance.importJobId) c.provenance.importJobId = jobId;
  }

  async touchConversation(conversationId: string, at: string) {
    const c = this.db.conversations.get(conversationId);
    if (c && c.lastActivityAt < at) c.lastActivityAt = at;
    for (const m of this.db.members.get(conversationId) ?? []) if (m.lastActivityAt < at) m.lastActivityAt = at;
  }

  async stageItems(items: ImportItemRecord[]) {
    for (const item of items) {
      const list = this.db.importItems.get(item.jobId);
      if (!list) throw new Error(`import job ${item.jobId} not found`);
      list.push(clone(item));
    }
  }

  async listItemsFrom(jobId: string, fromSeq: number, limit: number) {
    return (this.db.importItems.get(jobId) ?? []).filter(i => i.seq >= fromSeq).slice(0, limit).map(clone);
  }

  async recordOutcomes(jobId: string, updates: ItemOutcomeUpdate[], processedAt: string) {
    const bySeq = new Map((this.db.importItems.get(jobId) ?? []).map(i => [i.seq, i]));
    for (const u of updates) {
      const item = bySeq.get(u.seq);
      if (!item) throw new Error(`import item ${jobId}#${u.seq} not found`);
      Object.assign(item, { outcome: u.outcome, reason: u.reason, messageId: u.messageId, processedAt });
    }
  }

  async listProblemItems(jobId: string, limit: number) {
    return (this.db.importItems.get(jobId) ?? [])
      .filter(i => i.outcome === 'skipped' || i.outcome === 'failed')
      .slice(0, limit)
      .map(clone);
  }

  async insertMessagesIgnoringDuplicates(messages: MessageRecord[]) {
    const existing = new Set<string>();
    for (const m of this.db.messages.values()) {
      if (m.sourceKey) existing.add(`${m.ownerUserId}|${m.sourcePlatform}|${m.sourceKey}`);
    }
    const inserted = new Set<string>();
    for (const m of messages) {
      const key = `${m.ownerUserId}|${m.sourcePlatform}|${m.sourceKey}`;
      if (!m.sourceKey || existing.has(key)) continue;
      existing.add(key);
      this.db.messages.set(m.id, clone(m));
      inserted.add(m.sourceKey);
    }
    return inserted;
  }

  /** Test helper: number of imported messages stored for a user. */
  countImportedMessages(ownerUserId: string): number {
    return [...this.db.messages.values()].filter(m => m.ownerUserId === ownerUserId && m.origin === 'imported').length;
  }
}
