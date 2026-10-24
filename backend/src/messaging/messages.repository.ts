import { Injectable } from '@nestjs/common';
import type { DeliveryStatus } from '../common/domain.js';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { MessageRecord } from '../persistence/records.js';

export const MESSAGES_REPOSITORY = Symbol('MESSAGES_REPOSITORY');

export interface TimelineQuery {
  /** Keyset cursor: messages strictly older than this sent_at. */
  before?: string;
  limit: number;
}

export interface MessagesRepository {
  insert(message: MessageRecord): Promise<void>;
  findById(id: string): Promise<MessageRecord | null>;
  findByClientId(senderUserId: string, clientMessageId: string): Promise<MessageRecord | null>;
  /** Newest first; served by messages_timeline_idx in Postgres. */
  listTimeline(conversationId: string, query: TimelineQuery): Promise<MessageRecord[]>;
  updateStatus(id: string, status: DeliveryStatus): Promise<void>;
}

@Injectable()
export class InMemoryMessagesRepository implements MessagesRepository {
  constructor(private readonly db: InMemoryDb) {}

  async insert(message: MessageRecord) {
    this.db.messages.set(message.id, message);
  }

  async findById(id: string) {
    return this.db.messages.get(id) ?? null;
  }

  async findByClientId(senderUserId: string, clientMessageId: string) {
    for (const m of this.db.messages.values()) {
      if (m.senderUserId === senderUserId && m.clientMessageId === clientMessageId) return m;
    }
    return null;
  }

  async listTimeline(conversationId: string, q: TimelineQuery) {
    return [...this.db.messages.values()]
      .filter(m => m.conversationId === conversationId && (!q.before || m.sentAt < q.before))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt) || b.id.localeCompare(a.id))
      .slice(0, q.limit);
  }

  async updateStatus(id: string, status: DeliveryStatus) {
    const m = this.db.messages.get(id);
    if (m) {
      m.status = status;
      m.updatedAt = new Date().toISOString();
    }
  }
}
