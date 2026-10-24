import type { AppState, Contact, Conversation, Message } from '../../domain/types';
import { initialState } from '../demo';
import {
  defaultFilters, expiredMessageIds, InboxFilters, inboxRows, messagesByConversation, previewText, searchMessages, unreadCount,
} from '../selectors';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const DAY = 24 * 60;

function conv(id: string, extra: Partial<Conversation> = {}): Conversation {
  return {
    id, kind: 'direct', origin: 'native', source: 'hye', title: id, members: [{ contactId: 'me', role: 'admin' }],
    createdAt: ago(100 * DAY), lastActivityAt: ago(60), pinned: false, muted: false, archived: false, markedUnread: false,
    retention: 'off', lastReadAt: ago(60), ...extra,
  };
}

let seq = 0;
function msg(conversationId: string, extra: Partial<Message> = {}): Message {
  seq += 1;
  return {
    id: `m${seq}`, conversationId, senderId: 'c_x', senderName: 'X', text: `hello ${seq}`, sentAt: ago(120),
    reactions: [], attachments: [], ...extra,
  };
}

const contact = (id: string, extra: Partial<Contact> = {}): Contact => ({ id, displayName: id, handle: id, isDemo: true, ...extra });
const world = (extra: Partial<AppState>): AppState => ({ ...initialState, ...extra });
const f = (extra: Partial<InboxFilters> = {}): InboxFilters => ({ ...defaultFilters, ...extra });
const ids = (s: AppState, filters: InboxFilters) => inboxRows(s, filters).map(r => r.conversation.id);

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterAll(() => jest.useRealTimers());

describe('messagesByConversation', () => {
  it('groups by conversation and sorts each list by time', () => {
    const a1 = msg('a', { sentAt: ago(5) });
    const a2 = msg('a', { sentAt: ago(50) });
    const b1 = msg('b');
    const map = messagesByConversation([a1, b1, a2]);
    expect(map.get('a')!.map(m => m.id)).toEqual([a2.id, a1.id]);
    expect(map.get('b')).toEqual([b1]);
  });
});

describe('unreadCount', () => {
  const c = conv('c', { lastReadAt: ago(60) });

  it('counts messages from others after lastReadAt, excluding mine and system notices', () => {
    const msgs = [
      msg('c', { sentAt: ago(90) }), // before lastReadAt
      msg('c', { sentAt: ago(10) }),
      msg('c', { sentAt: ago(9) }),
      msg('c', { sentAt: ago(8), senderId: 'me' }),
      msg('c', { sentAt: ago(7), system: true }),
    ];
    expect(unreadCount(c, msgs)).toBe(2);
  });

  it('is always 0 for imported history', () => {
    const imported = conv('i', { origin: 'imported', lastReadAt: ago(1000), markedUnread: true });
    expect(unreadCount(imported, [msg('i', { sentAt: ago(1) })])).toBe(0);
  });

  it('reports 1 when manually marked unread with nothing new', () => {
    expect(unreadCount({ ...c, markedUnread: true }, [])).toBe(1);
  });

  it('uses the real count when marked unread and there are new messages', () => {
    expect(unreadCount({ ...c, markedUnread: true }, [msg('c', { sentAt: ago(1) }), msg('c', { sentAt: ago(2) })])).toBe(2);
  });

  it('defaults to no messages', () => {
    expect(unreadCount(c)).toBe(0);
  });
});

describe('inboxRows', () => {
  const direct = conv('direct', { members: [{ contactId: 'me', role: 'admin' }, { contactId: 'c_ava', role: 'member' }], lastActivityAt: ago(10), lastReadAt: ago(60) });
  const group = conv('group', { kind: 'group', title: 'Weekend hikers', members: [{ contactId: 'me', role: 'admin' }, { contactId: 'c_leo', role: 'member' }], lastActivityAt: ago(20) });
  const archived = conv('archived', { archived: true, lastActivityAt: ago(5) });
  const imported = conv('imported', { origin: 'imported', source: 'whatsapp', title: 'Priya', importedParticipants: ['Priya', 'Kannan'], lastActivityAt: ago(40 * DAY) });
  const blockedDm = conv('blockedDm', { members: [{ contactId: 'me', role: 'admin' }, { contactId: 'c_bad', role: 'member' }] });
  const blockedInGroup = conv('blockedGroup', { kind: 'group', members: [{ contactId: 'me', role: 'admin' }, { contactId: 'c_bad', role: 'member' }], lastActivityAt: ago(300) });
  const pinnedOld = conv('pinnedOld', { pinned: true, lastActivityAt: ago(10 * DAY) });

  const messages = [
    msg('direct', { sentAt: ago(10), text: 'Booking for 7pm?' }), // unread (after lastReadAt)
    msg('group', { sentAt: ago(70), text: 'Trail is open', attachments: [{ id: 'a1', kind: 'image', fileName: 'trail.jpg' }] }),
    msg('imported', { sentAt: ago(40 * DAY), senderId: 'Priya', senderName: 'Priya', text: 'Old memory from Goa' }),
    msg('pinnedOld', { sentAt: ago(10 * DAY), text: 'pinned thing' }),
  ];
  const s = world({
    contacts: [contact('c_ava'), contact('c_leo'), contact('c_bad', { blocked: true })],
    conversations: [direct, group, archived, imported, blockedDm, blockedInGroup, pinnedOld],
    messages,
  });

  it('"all" excludes archived and blocked direct chats, pinned first then most recent', () => {
    expect(ids(s, f())).toEqual(['pinnedOld', 'direct', 'group', 'blockedGroup', 'imported']);
  });

  it('keeps groups that contain a blocked contact', () => {
    expect(ids(s, f())).toContain('blockedGroup');
    expect(ids(s, f())).not.toContain('blockedDm');
  });

  it('"archived" shows only archived conversations', () => {
    expect(ids(s, f({ tab: 'archived' }))).toEqual(['archived']);
  });

  it('"unread" shows only conversations with unread messages', () => {
    const rows = inboxRows(s, f({ tab: 'unread' }));
    expect(rows.map(r => r.conversation.id)).toEqual(['direct']);
    expect(rows[0].unread).toBe(1);
  });

  it('"unread" includes chats manually marked unread', () => {
    const s2 = { ...s, conversations: s.conversations.map(c => (c.id === 'group' ? { ...c, markedUnread: true } : c)) };
    expect(ids(s2, f({ tab: 'unread' }))).toEqual(['direct', 'group']);
  });

  it('"imported" never shows native chats, and imported chats never count as unread', () => {
    expect(ids(s, f({ tab: 'imported' }))).toEqual(['imported']);
    expect(inboxRows(s, f({ tab: 'imported' }))[0].unread).toBe(0);
  });

  it('"personal" and "groups" split by kind', () => {
    expect(ids(s, f({ tab: 'personal' }))).toEqual(['pinnedOld', 'direct', 'imported']);
    expect(ids(s, f({ tab: 'groups' }))).toEqual(['group', 'blockedGroup']);
  });

  it('"connected" is empty while no live integrations exist', () => {
    expect(ids(s, f({ tab: 'connected' }))).toEqual([]);
  });

  it('nativeOnly hides imported history', () => {
    expect(ids(s, f({ nativeOnly: true }))).not.toContain('imported');
  });

  it('filters by platform', () => {
    expect(ids(s, f({ platforms: ['whatsapp'] }))).toEqual(['imported']);
  });

  it('filters by media kind', () => {
    expect(ids(s, f({ media: 'image' }))).toEqual(['group']);
    expect(ids(s, f({ media: 'video' }))).toEqual([]);
  });

  it('filters by person, including imported participant names', () => {
    expect(ids(s, f({ person: 'c_ava' }))).toEqual(['direct']);
    expect(ids(s, f({ person: 'Priya' }))).toEqual(['imported']);
  });

  it('filters by date window', () => {
    expect(ids(s, f({ since: '7d' }))).toEqual(['direct', 'group', 'blockedGroup']);
    expect(ids(s, f({ since: '30d' }))).toEqual(['pinnedOld', 'direct', 'group', 'blockedGroup']);
    expect(ids(s, f({ since: '365d' }))).toHaveLength(5);
  });

  it('searches titles and message text, case-insensitively and trimmed', () => {
    expect(ids(s, f({ query: '  weekend ' }))).toEqual(['group']);
    expect(ids(s, f({ query: 'GOA' }))).toEqual(['imported']);
    expect(ids(s, f({ query: 'nothing matches this' }))).toEqual([]);
  });

  it('uses the last non-system message as the preview row', () => {
    const s2 = { ...s, messages: [...s.messages, msg('direct', { sentAt: ago(1), system: true, text: 'You created it' })] };
    expect(inboxRows(s2, f()).find(r => r.conversation.id === 'direct')!.last!.text).toBe('Booking for 7pm?');
  });

  it('falls back to a system message when that is all there is', () => {
    const only = conv('only');
    const sys = msg('only', { system: true, text: 'You created “Only”' });
    const rows = inboxRows(world({ conversations: [only], messages: [sys] }), f());
    expect(rows[0].last).toBe(sys);
  });
});

describe('searchMessages', () => {
  const native = conv('n', { title: 'Ava' });
  const imported = conv('i', { origin: 'imported', title: 'Priya' });
  const s = world({
    conversations: [native, imported],
    messages: [
      msg('n', { text: 'Rooftop dinner at 7', sentAt: ago(10) }),
      msg('i', { text: 'rooftop photos from Goa', sentAt: ago(5) }),
      msg('n', { text: 'rooftop secret', deletedAt: ago(1) }),
      msg('n', { text: 'rooftop group created', system: true }),
      msg('i', { text: '', attachments: [{ id: 'a', kind: 'document', fileName: 'Rooftop-Invoice.pdf' }], sentAt: ago(2) }),
      msg('orphan', { text: 'rooftop in a deleted conversation' }),
    ],
  });

  it('requires at least 2 characters', () => {
    expect(searchMessages(s, 'r')).toEqual([]);
    expect(searchMessages(s, '  r  ')).toEqual([]);
  });

  it('matches text and file names across native and imported, newest first', () => {
    const hits = searchMessages(s, 'ROOFTOP');
    expect(hits.map(h => h.conversation.id)).toEqual(['i', 'i', 'n']);
    expect(hits[0].message.attachments[0].fileName).toBe('Rooftop-Invoice.pdf');
  });

  it('excludes deleted messages, system notices and messages without a conversation', () => {
    const texts = searchMessages(s, 'rooftop').map(h => h.message.text);
    expect(texts).not.toContain('rooftop secret');
    expect(texts).not.toContain('rooftop group created');
    expect(texts).not.toContain('rooftop in a deleted conversation');
  });

  it('honours the limit', () => {
    expect(searchMessages(s, 'rooftop', 1)).toHaveLength(1);
  });
});

describe('previewText', () => {
  it('handles missing, deleted, multi-line and attachment-only messages', () => {
    expect(previewText(undefined)).toBe('No messages yet');
    expect(previewText(msg('c', { deletedAt: ago(1), text: 'secret' }))).toBe('Message deleted');
    expect(previewText(msg('c', { text: 'first line\nsecond line' }))).toBe('first line');
    expect(previewText(msg('c', { text: '', attachments: [{ id: 'a', kind: 'image', fileName: 'x.jpg' }] }))).toBe('📷 Photo');
    expect(previewText(msg('c', { text: '', attachments: [{ id: 'a', kind: 'video', fileName: 'x.mp4' }] }))).toBe('🎬 Video');
    expect(previewText(msg('c', { text: '', attachments: [{ id: 'a', kind: 'audio', fileName: 'x.opus' }] }))).toBe('🎙 Audio');
    expect(previewText(msg('c', { text: '', attachments: [{ id: 'a', kind: 'document', fileName: 'x.pdf' }] }))).toBe('📄 Document');
    expect(previewText(msg('c', { text: '', attachments: [{ id: 'a', kind: 'other', fileName: 'x.bin' }] }))).toBe('📎 File');
    expect(previewText(msg('c', { text: '' }))).toBe('');
  });
});

describe('expiredMessageIds', () => {
  it('expires native messages past their conversation retention window only', () => {
    const s = world({
      conversations: [
        conv('day', { retention: '24h' }),
        conv('week', { retention: '7d' }),
        conv('quarter', { retention: '90d' }),
        conv('forever', { retention: 'off' }),
        conv('imported', { origin: 'imported', retention: '24h' }),
      ],
      messages: [
        msg('day', { id: 'day-old', sentAt: ago(DAY + 1) }),
        msg('day', { id: 'day-new', sentAt: ago(DAY - 1) }),
        msg('week', { id: 'week-old', sentAt: ago(8 * DAY) }),
        msg('week', { id: 'week-new', sentAt: ago(6 * DAY) }),
        msg('quarter', { id: 'quarter-old', sentAt: ago(91 * DAY) }),
        msg('quarter', { id: 'quarter-new', sentAt: ago(89 * DAY) }),
        msg('forever', { id: 'forever-old', sentAt: ago(1000 * DAY) }),
        msg('imported', { id: 'imported-old', sentAt: ago(1000 * DAY) }),
        msg('gone', { id: 'no-conversation', sentAt: ago(1000 * DAY) }),
      ],
    });
    expect([...expiredMessageIds(s, NOW)].sort()).toEqual(['day-old', 'quarter-old', 'week-old']);
  });
});
