import type { AppState, Attachment, Conversation, Message, SourcePlatform } from '@/domain/types';

export type InboxTab = 'all' | 'unread' | 'personal' | 'groups' | 'connected' | 'imported' | 'archived';

export interface InboxFilters {
  tab: InboxTab;
  query: string;
  platforms: SourcePlatform[];
  person: string | null; // contactId or imported participant name
  since: 'any' | '7d' | '30d' | '365d';
  media: Attachment['kind'] | 'any';
  /** Only conversations created in hye ("Messages" screen). */
  nativeOnly?: boolean;
}

export const defaultFilters: InboxFilters = { tab: 'all', query: '', platforms: [], person: null, since: 'any', media: 'any' };

export interface InboxRow {
  conversation: Conversation;
  last: Message | undefined;
  unread: number;
}

const DAYS = { '7d': 7, '30d': 30, '365d': 365 } as const;

export function messagesByConversation(messages: Message[]): Map<string, Message[]> {
  const map = new Map<string, Message[]>();
  for (const m of messages) {
    const list = map.get(m.conversationId);
    if (list) list.push(m);
    else map.set(m.conversationId, [m]);
  }
  for (const list of map.values()) list.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  return map;
}

export function unreadCount(c: Conversation, msgs: Message[] = []): number {
  if (c.origin === 'imported') return 0;
  const n = msgs.filter(m => m.senderId !== 'me' && !m.system && m.sentAt > c.lastReadAt).length;
  return n === 0 && c.markedUnread ? 1 : n;
}

export function inboxRows(state: AppState, f: InboxFilters, byConv = messagesByConversation(state.messages)): InboxRow[] {
  const q = f.query.trim().toLowerCase();
  const since = f.since === 'any' ? null : new Date(Date.now() - DAYS[f.since] * 86_400_000).toISOString();
  const blocked = new Set(state.contacts.filter(c => c.blocked).map(c => c.id));

  const rows: InboxRow[] = [];
  for (const c of state.conversations) {
    if (f.nativeOnly && c.origin !== 'native') continue;
    if (f.tab === 'archived' ? !c.archived : c.archived) continue;
    if (c.kind === 'direct' && c.members.some(m => blocked.has(m.contactId))) continue;
    const msgs = byConv.get(c.id) ?? [];
    const unread = unreadCount(c, msgs);
    if (f.tab === 'unread' && unread === 0) continue;
    if (f.tab === 'personal' && c.kind !== 'direct') continue;
    if (f.tab === 'groups' && c.kind !== 'group') continue;
    if (f.tab === 'imported' && c.origin !== 'imported') continue;
    // No live integrations exist yet, so "connected" is honestly empty.
    if (f.tab === 'connected' && !(c.origin === 'native' && c.source !== 'hye')) continue;
    if (f.platforms.length && !f.platforms.includes(c.source)) continue;
    if (since && c.lastActivityAt < since) continue;
    if (f.person && !c.members.some(m => m.contactId === f.person) && !c.importedParticipants?.includes(f.person)) continue;
    if (f.media !== 'any' && !msgs.some(m => m.attachments.some(a => a.kind === f.media))) continue;
    if (q && !c.title.toLowerCase().includes(q) && !msgs.some(m => m.text.toLowerCase().includes(q))) continue;
    rows.push({ conversation: c, last: lastVisible(msgs), unread });
  }
  return rows.sort((a, b) =>
    Number(b.conversation.pinned) - Number(a.conversation.pinned) ||
    b.conversation.lastActivityAt.localeCompare(a.conversation.lastActivityAt),
  );
}

function lastVisible(msgs: Message[]): Message | undefined {
  for (let i = msgs.length - 1; i >= 0; i--) if (!msgs[i].system) return msgs[i];
  return msgs[msgs.length - 1];
}

export interface SearchHit {
  message: Message;
  conversation: Conversation;
}

/** Case-insensitive message search across native and imported history. */
export function searchMessages(state: AppState, query: string, limit = 200): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const convs = new Map(state.conversations.map(c => [c.id, c]));
  const hits: SearchHit[] = [];
  for (const m of state.messages) {
    if (m.deletedAt || m.system) continue;
    const inText = m.text.toLowerCase().includes(q);
    const inFiles = m.attachments.some(a => a.fileName.toLowerCase().includes(q));
    if (!inText && !inFiles) continue;
    const conversation = convs.get(m.conversationId);
    if (conversation) hits.push({ message: m, conversation });
  }
  return hits.sort((a, b) => b.message.sentAt.localeCompare(a.message.sentAt)).slice(0, limit);
}

export function previewText(m: Message | undefined): string {
  if (!m) return 'No messages yet';
  if (m.deletedAt) return 'Message deleted';
  if (m.text) return m.text.split('\n')[0];
  const a = m.attachments[0];
  if (a) return { image: '📷 Photo', video: '🎬 Video', audio: '🎙 Audio', document: '📄 Document', other: '📎 File' }[a.kind];
  return '';
}

const RETENTION_MS = { '24h': 86_400_000, '7d': 7 * 86_400_000, '90d': 90 * 86_400_000 } as const;

/** Native messages past their conversation's retention window. Imported history is never auto-deleted. */
export function expiredMessageIds(state: AppState, now = Date.now()): Set<string> {
  const ids = new Set<string>();
  const policy = new Map(state.conversations.map(c => [c.id, c]));
  for (const m of state.messages) {
    const c = policy.get(m.conversationId);
    if (!c || c.origin !== 'native' || c.retention === 'off') continue;
    if (now - new Date(m.sentAt).getTime() > RETENTION_MS[c.retention]) ids.add(m.id);
  }
  return ids;
}
