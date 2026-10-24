import { newId } from '@/domain/hash';
import type { Attachment, Conversation, Message, Reaction, User } from '@/domain/types';

// Lively simulated chats with the demo contacts. Everything here is native + demo (never imported),
// and the UI labels these chats as demo / simulated.

const NAMES: Record<string, string> = {
  c_ava: 'Ava Chen', c_rahul: 'Rahul Menon', c_maya: 'Maya Okafor', c_leo: 'Leo Martins', c_sara: 'Sara Ibrahim',
  c_kenji: 'Kenji Watanabe', c_priya: 'Priya Nair', c_omar: 'Omar Haddad', c_zoe: 'Zoe Laurent', c_dev: 'Dev Patel',
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Line = [sender: string, text: string, ago: number, extra?: {
  photo?: string; doc?: string; audio?: string; react?: [string, string][]; reply?: number; edited?: boolean;
}];

const img = (seed: string): Attachment => ({
  id: newId('att'), kind: 'image', fileName: `${seed}.jpg`, uri: `https://picsum.photos/seed/${seed}/800/800`,
});
const file = (kind: Attachment['kind'], fileName: string): Attachment => ({
  id: newId('att'), kind, fileName, uri: `demo://files/${encodeURIComponent(fileName)}`,
});

interface Spec {
  id: string;
  title: string;
  kind: Conversation['kind'];
  members: string[];
  /** How many of the newest messages from others are still unread. */
  unread?: number;
  pinned?: boolean;
  muted?: boolean;
  lines: Line[];
}

function build(spec: Spec, user: User, now: number) {
  const iso = (ago: number) => new Date(now - ago).toISOString();
  const messages: Message[] = [];
  for (const [sender, text, ago, x = {}] of spec.lines) {
    const attachments: Attachment[] = [];
    if (x.photo) attachments.push(img(x.photo));
    if (x.doc) attachments.push(file('document', x.doc));
    if (x.audio) attachments.push(file('document', x.audio));
    const reactions: Reaction[] = (x.react ?? []).map(([emoji, by]) => ({ emoji, by }));
    messages.push({
      id: newId('msg'), conversationId: spec.id, senderId: sender, senderName: sender === 'me' ? user.displayName : NAMES[sender],
      text, sentAt: iso(ago), reactions, attachments, status: sender === 'me' ? 'read' : undefined,
      replyToId: x.reply !== undefined ? messages[x.reply]?.id : undefined,
      editedAt: x.edited ? iso(Math.max(0, ago - 2 * MIN)) : undefined,
    });
  }
  const last = messages[messages.length - 1];
  // lastReadAt sits just before the Nth-newest incoming message, so exactly `unread` messages count as unread.
  const incoming = messages.filter(m => m.senderId !== 'me');
  const firstUnread = spec.unread ? incoming[incoming.length - spec.unread] : undefined;
  const lastReadAt = firstUnread ? new Date(new Date(firstUnread.sentAt).getTime() - 1000).toISOString() : last.sentAt;
  const conversation: Conversation = {
    id: spec.id, kind: spec.kind, origin: 'native', source: 'hye', title: spec.title,
    members: [{ contactId: 'me', role: 'admin' }, ...spec.members.map(c => ({ contactId: c, role: 'member' as const }))],
    createdAt: iso(30 * DAY), lastActivityAt: last.sentAt, lastReadAt,
    pinned: !!spec.pinned, muted: !!spec.muted, archived: false, markedUnread: false, retention: 'off',
  };
  return { conversation, messages };
}

export function demoExtraChats(user: User, now: number): { conversations: Conversation[]; messages: Message[] } {
  const first = user.displayName.split(' ')[0] || 'you';
  const specs: Spec[] = [
    {
      id: 'cv_x_family', title: 'Family 🏡', kind: 'group', members: ['c_priya', 'c_dev', 'c_rahul'], pinned: true, unread: 3,
      lines: [
        ['system', `${NAMES.c_priya} added you`, 3 * DAY],
        ['c_priya', 'Amma wants a group photo at Diwali this year. No excuses 😄', 2 * DAY + 5 * HOUR],
        ['c_dev', 'I will be there, flight lands Friday night', 2 * DAY + 4 * HOUR, { react: [['🙌', 'c_priya']] }],
        ['me', 'Same. Should I bring the good camera?', 2 * DAY + 3 * HOUR],
        ['c_rahul', 'Yes please, my phone makes everyone look like potatoes', 2 * DAY + 3 * HOUR - 10 * MIN, { react: [['😂', 'me'], ['😂', 'c_dev']] }],
        ['c_priya', 'Found this from last year 🥹', DAY + 6 * HOUR, { photo: 'diwali-lamps' }],
        ['me', 'The lamps look beautiful', DAY + 5 * HOUR, { reply: 5, react: [['❤️', 'c_priya']] }],
        ['c_dev', 'Who is making the payasam this time?', DAY + 2 * HOUR],
        ['c_priya', 'Not me. Last time I burnt the milk and we never speak of it', DAY + HOUR + 50 * MIN],
        ['me', `I'll do it. ${first}'s famous recipe 👨‍🍳`, DAY + HOUR],
        ['c_rahul', 'Famous for what exactly 🤔', DAY + 40 * MIN, { reply: 9 }],
        ['c_priya', 'Grocery list so far: jaggery, cashews, cardamom, ghee', 3 * HOUR],
        ['c_dev', 'Adding sparklers. Responsible ones.', 50 * MIN],
        ['c_rahul', 'Mom just called. She says “bring sweaters, it gets cold”. It will be 28°C.', 12 * MIN],
      ],
    },
    {
      id: 'cv_x_lisbon', title: 'Lisbon trip ✈️', kind: 'group', members: ['c_maya', 'c_zoe', 'c_kenji', 'c_leo'], unread: 4,
      lines: [
        ['c_maya', 'Okay team, Lisbon plan v1 is in! 🇵🇹', 4 * DAY],
        ['c_maya', '', 4 * DAY - 2 * MIN, { doc: 'Lisbon-itinerary.pdf' }],
        ['c_zoe', 'Day 2 sunset at Miradouro da Senhora do Monte, non-negotiable', 4 * DAY - HOUR, { react: [['🌅', 'c_maya'], ['👍', 'me']] }],
        ['c_kenji', 'I will bring my film camera. Expect slow photos', 3 * DAY + 20 * HOUR],
        ['me', 'Booked my flight! Landing Thursday 10:40', 3 * DAY + 2 * HOUR, { react: [['🎉', 'c_maya'], ['🎉', 'c_zoe'], ['🎉', 'c_leo']] }],
        ['c_leo', 'Apartment options, vote please', 2 * DAY + 5 * HOUR],
        ['c_leo', 'Option A: Alfama, tiny balcony, steep stairs', 2 * DAY + 5 * HOUR - MIN, { photo: 'alfama-balcony' }],
        ['c_leo', 'Option B: Príncipe Real, big kitchen, no view', 2 * DAY + 5 * HOUR - 2 * MIN, { photo: 'lisbon-kitchen' }],
        ['me', 'A! Stairs are cardio', 2 * DAY + 4 * HOUR, { reply: 6 }],
        ['c_zoe', 'A for sure', 2 * DAY + 3 * HOUR],
        ['c_maya', 'A wins, booking it now ✅', 2 * DAY + HOUR],
        ['c_kenji', 'Is anyone up for a day trip to Sintra?', 7 * HOUR],
        ['c_zoe', 'Yes! Pena Palace early before the crowds', 6 * HOUR, { reply: 11 }],
        ['c_maya', 'Train leaves Rossio every 20 min, easy', 3 * HOUR],
        ['c_leo', 'I will handle the pastel de nata research 🥐', 40 * MIN, { react: [['😂', 'c_kenji']] }],
        ['c_maya', 'Reminder: pack layers, it gets windy by the river', 18 * MIN],
      ],
    },
    {
      id: 'cv_x_books', title: 'Book club 📚', kind: 'group', members: ['c_sara', 'c_ava', 'c_omar', 'c_zoe'], muted: true,
      lines: [
        ['c_sara', 'This month: “The Remains of the Day”. Who has finished?', 3 * DAY + 6 * HOUR],
        ['c_ava', 'Halfway. Stevens is breaking my heart quietly', 3 * DAY + 5 * HOUR],
        ['c_omar', 'Finished last night. That ending at the pier 😮‍💨', 3 * DAY + 2 * HOUR, { react: [['❤️', 'c_sara']] }],
        ['me', 'No spoilers! I am on chapter 4', 3 * DAY + HOUR, { reply: 2 }],
        ['c_zoe', 'My reading spot this week', 2 * DAY + 8 * HOUR, { photo: 'reading-nook' }],
        ['c_sara', 'That light! 😍', 2 * DAY + 7 * HOUR, { reply: 4 }],
        ['c_omar', 'I will bake something for the meeting. Thinking orange and cardamom cake', DAY + 9 * HOUR],
        ['c_ava', 'Omar you are a gift', DAY + 8 * HOUR, { react: [['🙏', 'c_omar']] }],
        ['c_sara', 'Meeting Sunday 5pm at mine. I will send the address', DAY + 2 * HOUR],
        ['me', 'See you all there 📖', DAY + HOUR],
      ],
    },
    {
      id: 'cv_x_kenji', title: NAMES.c_kenji, kind: 'direct', members: ['c_kenji'], unread: 2,
      lines: [
        ['c_kenji', 'Shot some frames in Shinjuku last night', 2 * DAY + 3 * HOUR],
        ['c_kenji', '', 2 * DAY + 3 * HOUR - MIN, { photo: 'tokyo-neon' }],
        ['c_kenji', '', 2 * DAY + 3 * HOUR - 2 * MIN, { photo: 'tokyo-rain' }],
        ['me', 'The rain one is unreal. What lens?', 2 * DAY + 2 * HOUR, { reply: 2, react: [['🙏', 'c_kenji']] }],
        ['c_kenji', '35mm, wide open. The reflections did all the work', 2 * DAY + HOUR],
        ['me', 'You should print these', 2 * DAY + 50 * MIN],
        ['c_kenji', 'Maybe a small zine? 20 copies, hand-stitched', DAY + 4 * HOUR],
        ['me', 'I would buy one immediately', DAY + 3 * HOUR, { react: [['❤️', 'c_kenji']] }],
        ['c_kenji', 'Here is a draft cover', 5 * HOUR, { photo: 'zine-cover' }],
        ['c_kenji', 'Honest opinion please 🙇', 5 * HOUR - MIN],
      ],
    },
    {
      id: 'cv_x_priya', title: NAMES.c_priya, kind: 'direct', members: ['c_priya'],
      lines: [
        ['c_priya', 'Recital is on Saturday at 6!! You are coming right? 💃', DAY + 10 * HOUR],
        ['me', 'Wouldn’t miss it. Front row', DAY + 9 * HOUR, { react: [['🥹', 'c_priya']] }],
        ['c_priya', 'Practising the new piece, listen to the intro', DAY + 8 * HOUR, { audio: 'Voice note 0:42.m4a' }],
        ['me', 'The tabla bit at the start 🔥', DAY + 7 * HOUR, { reply: 2 }],
        ['c_priya', 'Also I just finished a 14 hour shift so if I fall asleep mid-chat, that is why', 9 * HOUR],
        ['me', 'Go sleep, doctor! We can talk tomorrow', 8 * HOUR, { edited: true }],
        ['c_priya', 'Yes boss 😴', 8 * HOUR - 3 * MIN, { react: [['😂', 'me']] }],
        ['c_priya', 'Good morning! Costume fitting went well', 2 * HOUR, { photo: 'silk-costume' }],
        ['me', 'That colour is perfect on you', 90 * MIN],
      ],
    },
    {
      id: 'cv_x_omar', title: NAMES.c_omar, kind: 'direct', members: ['c_omar'], unread: 2,
      lines: [
        ['me', 'Omar, I need your shakshuka secret', 2 * DAY + 2 * HOUR],
        ['c_omar', 'Secret 1: patience. Secret 2: more cumin than you think', 2 * DAY + HOUR, { react: [['😂', 'me']] }],
        ['c_omar', 'Writing it down for you', 2 * DAY + 50 * MIN, { doc: 'Shakshuka - Omar.pdf' }],
        ['me', 'Made it! Not as pretty as yours', DAY + 5 * HOUR, { photo: 'shakshuka-pan' }],
        ['c_omar', 'Looks great! Next time crack the eggs into little wells', DAY + 4 * HOUR, { reply: 3 }],
        ['me', 'Taking notes 📝', DAY + 4 * HOUR - 5 * MIN],
        ['c_omar', 'Friday I am testing a new menu at the restaurant. Want to be a taster?', 4 * HOUR],
        ['c_omar', 'Bring an empty stomach and honest opinions', 4 * HOUR - MIN],
      ],
    },
    {
      id: 'cv_x_zoe', title: NAMES.c_zoe, kind: 'direct', members: ['c_zoe'],
      lines: [
        ['c_zoe', 'Got my film back from the lab!', 3 * DAY + 4 * HOUR],
        ['c_zoe', 'Marrakech, roll 1', 3 * DAY + 4 * HOUR - MIN, { photo: 'marrakech-film' }],
        ['me', 'Those colours! Portra?', 3 * DAY + 3 * HOUR],
        ['c_zoe', 'Portra 400, pushed one stop', 3 * DAY + 2 * HOUR, { reply: 2 }],
        ['c_zoe', 'Country 35 next month, thinking Georgia 🇬🇪', 2 * DAY],
        ['me', 'Tbilisi is on my list too. Send recommendations after?', 2 * DAY - HOUR, { react: [['👍', 'c_zoe']] }],
        ['c_zoe', 'Deal. I will make you a little map', 30 * HOUR],
      ],
    },
    {
      id: 'cv_x_dev', title: NAMES.c_dev, kind: 'direct', members: ['c_dev'], unread: 1,
      lines: [
        ['c_dev', 'Can I get 15 minutes of your brain this week?', 26 * HOUR],
        ['me', 'Sure, what is it about?', 25 * HOUR],
        ['c_dev', 'Onboarding for the new app. People drop off at step 3 and I cannot tell why', 24 * HOUR],
        ['c_dev', '', 24 * HOUR - MIN, { doc: 'Onboarding-funnel.pdf' }],
        ['me', 'Step 3 asks for contacts before showing any value. I would move it later', 20 * HOUR, { reply: 2, react: [['💡', 'c_dev']] }],
        ['c_dev', 'That is exactly what our designer said. Ok ok, two votes', 19 * HOUR],
        ['me', 'Thursday 4pm works for a call', 6 * HOUR],
        ['c_dev', 'Thursday 4pm it is. Coffee is on me ☕', 35 * MIN],
      ],
    },
  ];

  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  for (const spec of specs) {
    const built = build(spec, user, now);
    conversations.push(built.conversation);
    // System lines use the 'system' sender.
    messages.push(...built.messages.map(m => (m.senderId === 'system' ? { ...m, system: true, senderName: 'hye' } : m)));
  }
  return { conversations, messages };
}
