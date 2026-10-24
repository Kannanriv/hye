import { newId } from '@/domain/hash';
import type { AppState, Contact, Conversation, Message, User } from '@/domain/types';

// Simulated people for the prototype. Every one is flagged isDemo and labelled in the UI.
export const DEMO_CONTACTS: Contact[] = [
  { id: 'c_ava', displayName: 'Ava Chen', handle: 'ava', isDemo: true },
  { id: 'c_rahul', displayName: 'Rahul Menon', handle: 'rahul', isDemo: true },
  { id: 'c_maya', displayName: 'Maya Okafor', handle: 'maya', isDemo: true },
  { id: 'c_leo', displayName: 'Leo Martins', handle: 'leo', isDemo: true },
  { id: 'c_sara', displayName: 'Sara Ibrahim', handle: 'sara', isDemo: true },
];

export const DEMO_REPLIES = [
  'Sounds good 👍',
  'Give me a minute, just finishing something.',
  'Ha, yes!',
  'Can we talk about it tomorrow?',
  'Sent you the details.',
  'Perfect, thanks!',
];

export const initialState: AppState = {
  version: 1,
  user: null,
  contacts: [],
  conversations: [],
  messages: [],
  importJobs: [],
  savedLinks: [],
  audit: [],
  privacy: { readReceipts: true, typingIndicators: true, lastSeen: 'contacts', defaultRetention: 'off' },
  notifications: { messages: true, groups: true, importComplete: true, previews: false },
  theme: 'system',
};

function ago(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function conv(id: string, title: string, kind: Conversation['kind'], memberIds: string[], at: string, extra: Partial<Conversation> = {}): Conversation {
  return {
    id, title, kind, origin: 'native', source: 'hye', createdAt: ago(60 * 24 * 14), lastActivityAt: at,
    members: [{ contactId: 'me', role: 'admin' }, ...memberIds.map(c => ({ contactId: c, role: 'member' as const }))],
    pinned: false, muted: false, archived: false, markedUnread: false, retention: 'off', lastReadAt: at, ...extra,
  };
}

function msg(conversationId: string, senderId: string, senderName: string, text: string, minutesAgo: number, extra: Partial<Message> = {}): Message {
  return {
    id: newId('msg'), conversationId, senderId, senderName, text, sentAt: ago(minutesAgo),
    reactions: [], attachments: [], status: senderId === 'me' ? 'read' : undefined, ...extra,
  };
}

/** Seed the demo world for a freshly created account. */
export function demoWorld(user: User): Pick<AppState, 'contacts' | 'conversations' | 'messages'> {
  const conversations = [
    conv('cv_ava', 'Ava Chen', 'direct', ['c_ava'], ago(4), { pinned: true, lastReadAt: ago(30) }),
    conv('cv_rahul', 'Rahul Menon', 'direct', ['c_rahul'], ago(95)),
    conv('cv_weekend', 'Weekend hikers', 'group', ['c_maya', 'c_leo', 'c_sara'], ago(22), { lastReadAt: ago(60) }),
    conv('cv_design', 'Design crit', 'group', ['c_ava', 'c_leo'], ago(60 * 26), { muted: true }),
    conv('cv_sara', 'Sara Ibrahim', 'direct', ['c_sara'], ago(60 * 24 * 9), { archived: true }),
  ];
  const first = user.displayName.split(' ')[0];
  const messages: Message[] = [
    msg('cv_ava', 'c_ava', 'Ava Chen', `Hi ${first}! Did you see the new venue for Friday?`, 40),
    msg('cv_ava', 'me', user.displayName, 'Not yet, send it over', 38),
    msg('cv_ava', 'c_ava', 'Ava Chen', 'It’s the rooftop place near the station.', 6),
    msg('cv_ava', 'c_ava', 'Ava Chen', 'Booking for 7pm?', 4),
    msg('cv_rahul', 'c_rahul', 'Rahul Menon', 'Thanks for the notes on the proposal.', 120),
    msg('cv_rahul', 'me', user.displayName, 'Anytime. Ping me when v2 is ready.', 95, { reactions: [{ emoji: '🙏', by: 'c_rahul' }] }),
    msg('cv_weekend', 'c_maya', 'Maya Okafor', 'Trail is open again 🎉', 90),
    msg('cv_weekend', 'c_leo', 'Leo Martins', 'Saturday 8am at the north gate?', 45),
    msg('cv_weekend', 'c_sara', 'Sara Ibrahim', 'In. I’ll bring snacks.', 22),
    msg('cv_design', 'c_leo', 'Leo Martins', 'Uploaded the new onboarding flow.', 60 * 26),
    msg('cv_sara', 'c_sara', 'Sara Ibrahim', 'Old thread, archived on purpose.', 60 * 24 * 9),
  ];
  return { contacts: DEMO_CONTACTS, conversations, messages };
}
