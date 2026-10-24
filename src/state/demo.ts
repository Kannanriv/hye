import { newId } from '@/domain/hash';
import type { AppState, Contact, Conversation, Message, Post, User } from '@/domain/types';
import { demoExtraChats } from '@/features/chats/demo';
import { demoPhotoPosts } from '@/features/photos/demo';
import { demoTextPosts } from '@/features/posts/demo';
import { demoReels } from '@/features/reels/demo';

// Simulated people for the prototype. Every one is flagged isDemo and labelled in the UI.
const avatar = (n: number) => `https://i.pravatar.cc/300?img=${n}`;
const person = (id: string, displayName: string, handle: string, img: number, bio: string, following = true): Contact =>
  ({ id, displayName, handle, isDemo: true, avatarUrl: avatar(img), bio, following });

export const DEMO_CONTACTS: Contact[] = [
  person('c_ava', 'Ava Chen', 'ava', 47, 'Product designer · coffee snob · rooftop sunsets'),
  person('c_rahul', 'Rahul Menon', 'rahul', 12, 'Building things in Bengaluru. Cricket on weekends.'),
  person('c_maya', 'Maya Okafor', 'maya', 45, 'Trail runner 🏃🏾‍♀️ Photographer. Lagos → Lisbon.'),
  person('c_leo', 'Leo Martins', 'leo', 13, 'Frontend dev. Mechanical keyboards. Bad puns.'),
  person('c_sara', 'Sara Ibrahim', 'sara', 44, 'Baker of sourdough, reader of novels.'),
  person('c_kenji', 'Kenji Watanabe', 'kenji', 59, 'Street photography · Tokyo nights', true),
  person('c_priya', 'Priya Nair', 'priya', 32, 'Doctor by day, dancer by night 💃', true),
  person('c_omar', 'Omar Haddad', 'omar', 52, 'Chef. Food is love made visible.', true),
  person('c_zoe', 'Zoe Laurent', 'zoe', 25, 'Travel + film cameras. 34 countries and counting.', false),
  person('c_dev', 'Dev Patel', 'dev', 68, 'Startup founder. Writing about AI and product.', false),
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
  posts: [],
  progress: { xp: 0, achievements: [], celebrated: [] },
  delight: { haptics: true, celebrations: true, gamification: true },
};

/** Demo posts, photos and reels from simulated people. Every one is marked simulated. */
export function demoPosts(now = Date.now()): Post[] {
  return [...demoTextPosts(now), ...demoPhotoPosts(now), ...demoReels(now)];
}

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
export function demoWorld(user: User): Pick<AppState, 'contacts' | 'conversations' | 'messages' | 'posts'> {
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
  const extra = demoExtraChats(user, Date.now());
  return { contacts: DEMO_CONTACTS, conversations: [...conversations, ...extra.conversations], messages: [...messages, ...extra.messages], posts: demoPosts() };
}
