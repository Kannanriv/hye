import { Injectable } from '@nestjs/common';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { ConversationRecord, MemberRecord } from '../persistence/records.js';

export const CONVERSATIONS_REPOSITORY = Symbol('CONVERSATIONS_REPOSITORY');

export interface InboxQuery {
  archived: boolean;
  /** Keyset cursor: only conversations with last_activity_at strictly before this. */
  before?: string;
  limit: number;
}

export interface InboxRow {
  conversation: ConversationRecord;
  membership: MemberRecord;
}

export type MemberPrefs = Partial<Pick<MemberRecord, 'pinned' | 'muted' | 'archived' | 'markedUnread' | 'lastReadAt'>>;

export interface ConversationsRepository {
  insert(conversation: ConversationRecord, members: MemberRecord[]): Promise<void>;
  findById(id: string): Promise<ConversationRecord | null>;
  findMembership(conversationId: string, userId: string): Promise<MemberRecord | null>;
  listActiveMemberIds(conversationId: string): Promise<string[]>;
  /** Inbox for a member: served by conversation_members_inbox_idx in Postgres. */
  listInbox(userId: string, query: InboxQuery): Promise<InboxRow[]>;
  updateMemberPrefs(conversationId: string, userId: string, prefs: MemberPrefs): Promise<MemberRecord | null>;
  updateRetention(conversationId: string, retention: ConversationRecord['retention']): Promise<void>;
  /** Bumps last_activity_at on the conversation and every member row. */
  touch(conversationId: string, at: string): Promise<void>;
}

@Injectable()
export class InMemoryConversationsRepository implements ConversationsRepository {
  constructor(private readonly db: InMemoryDb) {}

  async insert(conversation: ConversationRecord, members: MemberRecord[]) {
    this.db.conversations.set(conversation.id, conversation);
    this.db.members.set(conversation.id, members);
  }

  async findById(id: string) {
    const c = this.db.conversations.get(id);
    return c && !c.deletedAt ? c : null;
  }

  async findMembership(conversationId: string, userId: string) {
    return this.db.members.get(conversationId)?.find(m => m.userId === userId && !m.leftAt) ?? null;
  }

  async listActiveMemberIds(conversationId: string) {
    return (this.db.members.get(conversationId) ?? []).filter(m => !m.leftAt).map(m => m.userId);
  }

  async listInbox(userId: string, q: InboxQuery) {
    const rows: InboxRow[] = [];
    for (const [conversationId, members] of this.db.members) {
      const membership = members.find(m => m.userId === userId && !m.leftAt);
      const conversation = this.db.conversations.get(conversationId);
      if (!membership || !conversation || conversation.deletedAt) continue;
      if (membership.archived !== q.archived) continue;
      if (q.before && !(membership.lastActivityAt < q.before)) continue;
      rows.push({ conversation, membership });
    }
    return rows
      .sort((a, b) => b.membership.lastActivityAt.localeCompare(a.membership.lastActivityAt))
      .slice(0, q.limit);
  }

  async updateMemberPrefs(conversationId: string, userId: string, prefs: MemberPrefs) {
    const m = await this.findMembership(conversationId, userId);
    if (!m) return null;
    Object.assign(m, prefs);
    return m;
  }

  async updateRetention(conversationId: string, retention: ConversationRecord['retention']) {
    const c = this.db.conversations.get(conversationId);
    if (c) {
      c.retention = retention;
      c.updatedAt = new Date().toISOString();
    }
  }

  async touch(conversationId: string, at: string) {
    const c = this.db.conversations.get(conversationId);
    if (c && c.lastActivityAt < at) c.lastActivityAt = at;
    for (const m of this.db.members.get(conversationId) ?? []) if (m.lastActivityAt < at) m.lastActivityAt = at;
  }
}
