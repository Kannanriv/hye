jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import type { AppState, Conversation, Message, User } from '../../domain/types';
import { DEMO_CONTACTS, initialState } from '../demo';
import { reducer } from '../store';

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const user: User = { id: 'usr_1', displayName: 'Kannan T', handle: 'kannan', phone: '+919876543210', createdAt: ago(0) };

function conv(id: string, extra: Partial<Conversation> = {}): Conversation {
  return {
    id, kind: 'direct', origin: 'native', source: 'hye', title: id, members: [{ contactId: 'me', role: 'admin' }],
    createdAt: ago(1000), lastActivityAt: ago(60), pinned: false, muted: false, archived: false, markedUnread: false,
    retention: 'off', lastReadAt: ago(60), ...extra,
  };
}

function msg(id: string, conversationId: string, extra: Partial<Message> = {}): Message {
  return { id, conversationId, senderId: 'c_x', senderName: 'X', text: id, sentAt: ago(10), reactions: [], attachments: [], ...extra };
}

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterAll(() => jest.useRealTimers());

describe('reducer: signUp', () => {
  it('stores the user and seeds the labelled demo world, keeping the theme', () => {
    const s = reducer({ ...initialState, theme: 'dark', audit: [{ id: 'a', at: ago(1), action: 'x', detail: '' }] }, { type: 'signUp', user });
    expect(s.user).toEqual(user);
    expect(s.theme).toBe('dark');
    expect(s.audit).toEqual([]);
    expect(s.contacts).toEqual(DEMO_CONTACTS);
    expect(s.contacts.every(c => c.isDemo)).toBe(true);
    expect(s.conversations.map(c => c.id).slice(0, 5)).toEqual(['cv_ava', 'cv_rahul', 'cv_weekend', 'cv_design', 'cv_sara']);
    expect(s.conversations.some(c => c.id.startsWith('cv_x_'))).toBe(true);
    expect(s.posts.length).toBeGreaterThan(0);
    expect(s.posts.every(p => p.simulated)).toBe(true);
    expect(s.conversations.every(c => c.origin === 'native')).toBe(true);
    expect(s.conversations.find(c => c.id === 'cv_ava')!.pinned).toBe(true);
    expect(s.conversations.find(c => c.id === 'cv_sara')!.archived).toBe(true);
    expect(s.messages.length).toBeGreaterThan(11);
    expect(s.messages[0].text).toContain('Hi Kannan!');
    expect(new Set(s.messages.map(m => m.id)).size).toBe(s.messages.length);
  });
});

describe('reducer: addMessages', () => {
  const base: AppState = {
    ...initialState,
    conversations: [
      conv('native', { archived: true, lastActivityAt: ago(60) }),
      conv('imported', { origin: 'imported', archived: true, lastActivityAt: ago(60) }),
      conv('other', { lastActivityAt: ago(60) }),
    ],
  };

  it('returns the same state for an empty batch', () => {
    expect(reducer(base, { type: 'addMessages', messages: [] })).toBe(base);
  });

  it('appends messages, bumps lastActivityAt to the newest, and unarchives native chats', () => {
    const s = reducer(base, { type: 'addMessages', messages: [msg('a', 'native', { sentAt: ago(5) }), msg('b', 'native', { sentAt: ago(2) })] });
    const c = s.conversations.find(x => x.id === 'native')!;
    expect(c.lastActivityAt).toBe(ago(2));
    expect(c.archived).toBe(false);
    expect(s.messages.map(m => m.id)).toEqual(['a', 'b']);
    expect(s.conversations.find(x => x.id === 'other')).toBe(base.conversations[2]);
  });

  it('keeps imported chats archived', () => {
    const s = reducer(base, { type: 'addMessages', messages: [msg('a', 'imported', { sentAt: ago(1) })] });
    const c = s.conversations.find(x => x.id === 'imported')!;
    expect(c.lastActivityAt).toBe(ago(1));
    expect(c.archived).toBe(true);
  });

  it('does not move lastActivityAt backwards', () => {
    const s = reducer(base, { type: 'addMessages', messages: [msg('a', 'native', { sentAt: ago(500) })] });
    const c = s.conversations.find(x => x.id === 'native')!;
    expect(c.lastActivityAt).toBe(ago(60));
    expect(c.archived).toBe(true);
  });

  it('touch: false leaves conversations untouched (import batches)', () => {
    const s = reducer(base, { type: 'addMessages', messages: [msg('a', 'native', { sentAt: ago(1) })], touch: false });
    expect(s.conversations).toBe(base.conversations);
    expect(s.messages).toHaveLength(1);
  });
});

describe('reducer: toggleReaction', () => {
  const base: AppState = {
    ...initialState,
    messages: [msg('m', 'c', { reactions: [{ emoji: '🙏', by: 'c_rahul' }] }), msg('n', 'c')],
  };

  it('adds my reaction, replaces it with a different emoji, and removes it when repeated', () => {
    const added = reducer(base, { type: 'toggleReaction', id: 'm', emoji: '👍' });
    expect(added.messages[0].reactions).toEqual([{ emoji: '🙏', by: 'c_rahul' }, { emoji: '👍', by: 'me' }]);
    expect(added.messages[1]).toBe(base.messages[1]);

    const swapped = reducer(added, { type: 'toggleReaction', id: 'm', emoji: '❤️' });
    expect(swapped.messages[0].reactions).toEqual([{ emoji: '🙏', by: 'c_rahul' }, { emoji: '❤️', by: 'me' }]);

    const removed = reducer(swapped, { type: 'toggleReaction', id: 'm', emoji: '❤️' });
    expect(removed.messages[0].reactions).toEqual([{ emoji: '🙏', by: 'c_rahul' }]);
  });

  it('can react with the same emoji someone else used', () => {
    const s = reducer(base, { type: 'toggleReaction', id: 'm', emoji: '🙏' });
    expect(s.messages[0].reactions).toHaveLength(2);
  });
});

describe('reducer: conversations', () => {
  const base: AppState = {
    ...initialState,
    conversations: [conv('a'), conv('b')],
    messages: [msg('a1', 'a'), msg('a2', 'a'), msg('b1', 'b')],
  };

  it('deleteConversation removes the conversation and all its messages only', () => {
    const s = reducer(base, { type: 'deleteConversation', id: 'a' });
    expect(s.conversations.map(c => c.id)).toEqual(['b']);
    expect(s.messages.map(m => m.id)).toEqual(['b1']);
  });

  it('upsertConversation prepends new and replaces existing', () => {
    const s1 = reducer(base, { type: 'upsertConversation', conversation: conv('c') });
    expect(s1.conversations.map(c => c.id)).toEqual(['c', 'a', 'b']);
    const s2 = reducer(s1, { type: 'upsertConversation', conversation: conv('a', { title: 'Renamed' }) });
    expect(s2.conversations.map(c => c.title)).toEqual(['c', 'Renamed', 'b']);
  });

  it('patchConversation and patchMessage merge fields', () => {
    const s = reducer(reducer(base, { type: 'patchConversation', id: 'b', patch: { pinned: true } }), { type: 'patchMessage', id: 'a1', patch: { status: 'read' } });
    expect(s.conversations[1].pinned).toBe(true);
    expect(s.messages[0].status).toBe('read');
  });
});

describe('reducer: applyRetention', () => {
  it('drops expired native messages and keeps imported history', () => {
    const base: AppState = {
      ...initialState,
      conversations: [conv('n', { retention: '24h' }), conv('i', { origin: 'imported', retention: '24h' })],
      messages: [msg('old', 'n', { sentAt: ago(2 * 24 * 60) }), msg('new', 'n', { sentAt: ago(5) }), msg('imp', 'i', { sentAt: ago(10 * 24 * 60) })],
    };
    const s = reducer(base, { type: 'applyRetention' });
    expect(s.messages.map(m => m.id)).toEqual(['new', 'imp']);
  });

  it('returns the same state object when nothing expired', () => {
    const base: AppState = { ...initialState, conversations: [conv('n')], messages: [msg('old', 'n', { sentAt: ago(99999) })] };
    expect(reducer(base, { type: 'applyRetention' })).toBe(base);
  });
});

describe('reducer: reset and misc', () => {
  it('reset wipes everything back to the initial state (including theme)', () => {
    const signedIn = reducer({ ...initialState, theme: 'dark' }, { type: 'signUp', user });
    const s = reducer(signedIn, { type: 'reset' });
    expect(s).toEqual(initialState);
    expect(s).not.toBe(initialState);
    expect(s.user).toBeNull();
  });

  it('hydrate returns state as-is when signed out or already migrated (has posts)', () => {
    const signedOut = { ...initialState };
    expect(reducer(initialState, { type: 'hydrate', state: signedOut })).toBe(signedOut);
    const current = { ...reducer(initialState, { type: 'signUp', user }), posts: [{ id: 'p1' }] } as unknown as AppState;
    expect(reducer(initialState, { type: 'hydrate', state: current })).toBe(current);
  });

  it('hydrate migrates an older signed-in state (no posts), keeping user, messages and adding demo contacts', () => {
    const old = { ...initialState, user, contacts: [], posts: [], messages: [msg('keep', 'c')] } as AppState;
    const s = reducer(initialState, { type: 'hydrate', state: old });
    expect(s.user).toMatchObject(user);
    expect(s.messages.map(m => m.id)).toContain('keep');
    expect(s.contacts.map(c => c.id)).toEqual(expect.arrayContaining(DEMO_CONTACTS.map(c => c.id)));
  });

  it('audit keeps newest first and caps at 500', () => {
    let s: AppState = initialState;
    for (let i = 0; i < 505; i++) s = reducer(s, { type: 'audit', event: { id: `e${i}`, at: ago(0), action: 'x', detail: '' } });
    expect(s.audit).toHaveLength(500);
    expect(s.audit[0].id).toBe('e504');
  });

  it('privacy/notifications patches merge', () => {
    const s = reducer(reducer(initialState, { type: 'privacy', patch: { readReceipts: false } }), { type: 'notifications', patch: { previews: true } });
    expect(s.privacy).toEqual({ ...initialState.privacy, readReceipts: false });
    expect(s.notifications.previews).toBe(true);
  });
});
