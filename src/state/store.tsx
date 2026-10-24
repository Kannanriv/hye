import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { newId } from '@/domain/hash';
import type {
  AppState, Attachment, AuditEvent, Contact, Conversation, ImportJob, Message, NotificationPrefs, PrivacySettings, SavedLink, User,
} from '@/domain/types';
import { DEMO_REPLIES, demoWorld, initialState } from './demo';
import { expiredMessageIds } from './selectors';

const STORAGE_KEY = 'hye/state/v1';

type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'signUp'; user: User }
  | { type: 'addMessages'; messages: Message[]; touch?: boolean }
  | { type: 'patchMessage'; id: string; patch: Partial<Message> }
  | { type: 'toggleReaction'; id: string; emoji: string }
  | { type: 'upsertConversation'; conversation: Conversation }
  | { type: 'patchConversation'; id: string; patch: Partial<Conversation> }
  | { type: 'deleteConversation'; id: string }
  | { type: 'upsertImportJob'; job: ImportJob }
  | { type: 'patchContact'; id: string; patch: Partial<Contact> }
  | { type: 'addContact'; contact: Contact }
  | { type: 'saveLink'; link: SavedLink }
  | { type: 'removeLink'; id: string }
  | { type: 'privacy'; patch: Partial<PrivacySettings> }
  | { type: 'notifications'; patch: Partial<NotificationPrefs> }
  | { type: 'theme'; theme: AppState['theme'] }
  | { type: 'audit'; event: AuditEvent }
  | { type: 'applyRetention' }
  | { type: 'reset' };

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'hydrate':
      return a.state;
    case 'signUp':
      return { ...initialState, user: a.user, ...demoWorld(a.user), theme: s.theme };
    case 'addMessages': {
      if (!a.messages.length) return s;
      let conversations = s.conversations;
      if (a.touch !== false) {
        const latest = new Map<string, string>();
        for (const m of a.messages) if (m.sentAt > (latest.get(m.conversationId) ?? '')) latest.set(m.conversationId, m.sentAt);
        conversations = s.conversations.map(c => {
          const t = latest.get(c.id);
          return t && t > c.lastActivityAt ? { ...c, lastActivityAt: t, archived: c.origin === 'native' ? false : c.archived } : c;
        });
      }
      return { ...s, conversations, messages: [...s.messages, ...a.messages] };
    }
    case 'patchMessage':
      return { ...s, messages: s.messages.map(m => (m.id === a.id ? { ...m, ...a.patch } : m)) };
    case 'toggleReaction':
      return {
        ...s,
        messages: s.messages.map(m => {
          if (m.id !== a.id) return m;
          const mine = m.reactions.find(r => r.by === 'me');
          const others = m.reactions.filter(r => r.by !== 'me');
          return { ...m, reactions: mine?.emoji === a.emoji ? others : [...others, { emoji: a.emoji, by: 'me' }] };
        }),
      };
    case 'upsertConversation': {
      const exists = s.conversations.some(c => c.id === a.conversation.id);
      return {
        ...s,
        conversations: exists
          ? s.conversations.map(c => (c.id === a.conversation.id ? a.conversation : c))
          : [a.conversation, ...s.conversations],
      };
    }
    case 'patchConversation':
      return { ...s, conversations: s.conversations.map(c => (c.id === a.id ? { ...c, ...a.patch } : c)) };
    case 'deleteConversation':
      return {
        ...s,
        conversations: s.conversations.filter(c => c.id !== a.id),
        messages: s.messages.filter(m => m.conversationId !== a.id),
      };
    case 'upsertImportJob': {
      const exists = s.importJobs.some(j => j.id === a.job.id);
      return { ...s, importJobs: exists ? s.importJobs.map(j => (j.id === a.job.id ? a.job : j)) : [a.job, ...s.importJobs] };
    }
    case 'patchContact':
      return { ...s, contacts: s.contacts.map(c => (c.id === a.id ? { ...c, ...a.patch } : c)) };
    case 'addContact':
      return { ...s, contacts: [...s.contacts, a.contact] };
    case 'saveLink':
      return { ...s, savedLinks: [a.link, ...s.savedLinks] };
    case 'removeLink':
      return { ...s, savedLinks: s.savedLinks.filter(l => l.id !== a.id) };
    case 'privacy':
      return { ...s, privacy: { ...s.privacy, ...a.patch } };
    case 'notifications':
      return { ...s, notifications: { ...s.notifications, ...a.patch } };
    case 'theme':
      return { ...s, theme: a.theme };
    case 'audit':
      return { ...s, audit: [a.event, ...s.audit].slice(0, 500) };
    case 'applyRetention': {
      const expired = expiredMessageIds(s);
      return expired.size ? { ...s, messages: s.messages.filter(m => !expired.has(m.id)) } : s;
    }
    case 'reset':
      return { ...initialState };
  }
}

export interface Typing {
  conversationId: string;
  name: string;
}

interface StoreValue {
  state: AppState;
  ready: boolean;
  dispatch: (a: Action) => void;
  /** Writes state to disk immediately (used between import batches so imports can resume). */
  flush: () => Promise<void>;
  typing: Typing | null;
  audit: (action: string, detail: string) => void;
  sendMessage: (conversationId: string, text: string, opts?: { attachments?: Attachment[]; replyToId?: string; forwardedFrom?: string }) => void;
  markRead: (conversationId: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);
  const [typing, setTyping] = useState<Typing | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) dispatch({ type: 'hydrate', state: { ...initialState, ...JSON.parse(raw) } });
        dispatch({ type: 'applyRetention' });
      })
      .catch(() => {
        // Corrupt or unreadable storage: start clean rather than crash. Nothing is overwritten until the next change.
      })
      .finally(() => setReady(true));
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const flush = useCallback(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current)), []);

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => {
      flush().catch(() => undefined);
    }, 300);
    return () => clearTimeout(id);
  }, [state, ready, flush]);

  const audit = useCallback((action: string, detail: string) => {
    dispatch({ type: 'audit', event: { id: newId('aud'), at: new Date().toISOString(), action, detail } });
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  /** Simulated delivery, read and reply for demo contacts only. Clearly labelled in the UI. */
  const simulateDemo = useCallback(
    (conversationId: string, messageId: string) => {
      const s = stateRef.current;
      const conv = s.conversations.find(c => c.id === conversationId);
      if (!conv || conv.origin !== 'native') return;
      const others = conv.members
        .map(m => s.contacts.find(c => c.id === m.contactId))
        .filter((c): c is Contact => !!c && c.isDemo && !c.blocked);
      if (!others.length) return;
      later(500, () => dispatch({ type: 'patchMessage', id: messageId, patch: { status: 'delivered' } }));
      later(1400, () => dispatch({ type: 'patchMessage', id: messageId, patch: { status: 'read' } }));
      if (Math.random() < 0.25) return; // people don't always reply
      const who = others[Math.floor(Math.random() * others.length)];
      later(1800, () => setTyping({ conversationId, name: who.displayName }));
      later(3600, () => {
        setTyping(null);
        dispatch({
          type: 'addMessages',
          messages: [{
            id: newId('msg'), conversationId, senderId: who.id, senderName: who.displayName,
            text: DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)],
            sentAt: new Date().toISOString(), reactions: [], attachments: [],
          }],
        });
      });
    },
    [later],
  );

  const sendMessage = useCallback<StoreValue['sendMessage']>(
    (conversationId, text, opts = {}) => {
      const user = stateRef.current.user;
      if (!user) return;
      const id = newId('msg');
      const now = new Date().toISOString();
      dispatch({
        type: 'addMessages',
        messages: [{
          id, conversationId, senderId: 'me', senderName: user.displayName, text: text.trim(), sentAt: now,
          reactions: [], attachments: opts.attachments ?? [], replyToId: opts.replyToId, forwardedFrom: opts.forwardedFrom, status: 'sending',
        }],
      });
      dispatch({ type: 'patchConversation', id: conversationId, patch: { lastReadAt: now, markedUnread: false } });
      later(250, () => dispatch({ type: 'patchMessage', id, patch: { status: 'sent' } }));
      simulateDemo(conversationId, id);
    },
    [later, simulateDemo],
  );

  const markRead = useCallback((conversationId: string) => {
    const c = stateRef.current.conversations.find(x => x.id === conversationId);
    if (!c) return;
    const now = new Date().toISOString();
    if (c.lastReadAt < now || c.markedUnread) dispatch({ type: 'patchConversation', id: conversationId, patch: { lastReadAt: now, markedUnread: false } });
  }, []);

  const value = useMemo(
    () => ({ state, ready, dispatch, flush, typing, audit, sendMessage, markRead }),
    [state, ready, flush, typing, audit, sendMessage, markRead],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}
