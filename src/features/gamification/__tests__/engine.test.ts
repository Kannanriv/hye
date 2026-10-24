import type { AppState, Post } from '../../../domain/types';
import {
  ACHIEVEMENTS, computeXp, diminishing, factsFor, headline, LEVELS, levelFor, newlyUnlocked, nextSteps,
} from '../engine';

const SIGNUP = '2026-10-01T00:00:00.000Z';
const LATER = '2026-10-02T00:00:00.000Z';

function base(): AppState {
  return {
    version: 1,
    user: { id: 'u1', displayName: 'Kannan T', phone: '+919876543210', createdAt: SIGNUP },
    contacts: [], conversations: [], messages: [], importJobs: [], savedLinks: [], audit: [],
    privacy: { readReceipts: true, typingIndicators: true, lastSeen: 'contacts', defaultRetention: 'off' },
    notifications: { messages: true, groups: true, importComplete: true, previews: false },
    theme: 'system', posts: [],
    progress: { xp: 0, achievements: [], celebrated: [] },
    delight: { haptics: true, celebrations: true, gamification: true },
  };
}

let n = 0;
function post(extra: Partial<Post> = {}): Post {
  n++;
  return {
    id: `p${n}`, kind: 'text', authorId: 'me', text: 'hi', media: [], createdAt: LATER, likes: [], reposts: [], comments: [],
    saved: false, views: 0, audience: 'everyone', ...extra,
  };
}

const audit = (action: string) => ({ id: `a${++n}`, at: LATER, action, detail: '' });

describe('diminishing', () => {
  it('rewards the first action most and caps the total', () => {
    expect(diminishing(0, 20, 100)).toBe(0);
    expect(diminishing(1, 20, 100)).toBe(20);
    expect(diminishing(2, 20, 100)).toBe(30);
    expect(diminishing(10_000, 20, 100)).toBe(100);
  });
});

describe('computeXp', () => {
  it('is zero for a fresh account with no name-less profile bonus beyond the name', () => {
    expect(computeXp(base())).toBe(10); // display name only
  });

  it('cannot be farmed by spamming posts', () => {
    const s = base();
    const one = computeXp({ ...s, posts: [post()] });
    const many = computeXp({ ...s, posts: Array.from({ length: 500 }, () => post()) });
    expect(one).toBe(30);
    expect(many).toBe(110); // 10 name + capped 100 for posts
  });

  it('ignores simulated demo posts and demo messages seeded before sign-up', () => {
    const s = base();
    s.conversations = [{
      id: 'cv', kind: 'direct', origin: 'native', source: 'hye', title: 'x', members: [], createdAt: SIGNUP, lastActivityAt: SIGNUP,
      pinned: false, muted: false, archived: false, markedUnread: false, retention: 'off', lastReadAt: SIGNUP,
    }];
    s.messages = [{ id: 'm', conversationId: 'cv', senderId: 'me', senderName: 'K', text: 'old', sentAt: '2026-09-30T00:00:00.000Z', reactions: [], attachments: [] }];
    s.posts = [post({ authorId: 'c_ava', simulated: true }), post({ simulated: true })];
    expect(computeXp(s)).toBe(10);
    s.messages.push({ ...s.messages[0], id: 'm2', sentAt: LATER });
    expect(computeXp(s)).toBe(20);
  });

  it('adds the stored bonus and achievement tiers', () => {
    const s = base();
    s.progress = { xp: 7, achievements: [{ id: 'data_owner', unlockedAt: LATER }], celebrated: [] };
    expect(computeXp(s)).toBe(10 + 7 + 50);
  });
});

describe('levelFor', () => {
  it('maps XP to levels and progress', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Newcomer', current: 0, next: 60, pct: 0 });
    expect(levelFor(30).pct).toBeCloseTo(0.5);
    expect(levelFor(60)).toMatchObject({ level: 2, title: 'Conversationalist' });
    const top = levelFor(100_000);
    expect(top).toMatchObject({ level: LEVELS.length, title: 'Trailblazer', next: null, pct: 1 });
    expect(levelFor(-5).level).toBe(1);
  });
});

describe('achievements', () => {
  it('have unique ids and no time-spent or streak rules', () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.join(' ')).not.toMatch(/streak|daily|minutes|hours/);
  });

  it('unlocks from real progress only and skips ones already recorded', () => {
    const s = base();
    expect(newlyUnlocked(s)).toEqual([]);
    s.user = { ...s.user!, handle: 'kannan', bio: 'Hi there' };
    s.posts = [post(), post({ kind: 'photo' }), post({ kind: 'reel' })];
    s.audit = [audit('privacy.changed'), audit('data.exported'), audit('group.created')];
    const fresh = newlyUnlocked(s);
    expect(fresh).toEqual(expect.arrayContaining([
      'profile_complete', 'first_post', 'shutterbug', 'director', 'well_rounded', 'privacy_pro', 'data_owner', 'group_founder',
    ]));
    expect(fresh).not.toContain('explorer');
    s.progress.achievements = fresh.map(id => ({ id, unlockedAt: LATER }));
    expect(newlyUnlocked(s)).toEqual([]);
  });

  it('counts comments toward Good listener with visible progress', () => {
    const s = base();
    const target = post({ authorId: 'c_ava', simulated: true, comments: [1, 2, 3, 4].map(i => ({ id: `c${i}`, authorId: 'me', text: 'nice', createdAt: LATER })) });
    s.posts = [target];
    const def = ACHIEVEMENTS.find(a => a.id === 'good_listener')!;
    expect(def.progress!(factsFor(s))).toEqual({ current: 4, target: 5 });
    expect(newlyUnlocked(s)).not.toContain('good_listener');
    s.posts = [{ ...target, comments: [...target.comments, { id: 'c5', authorId: 'me', text: 'yes', createdAt: LATER }] }];
    expect(newlyUnlocked(s)).toContain('good_listener');
  });

  it('unlocks Explorer once every main tab was visited', () => {
    const s = base();
    expect(newlyUnlocked(s, { visited: ['chats', 'posts', 'reels', 'photos'] })).not.toContain('explorer');
    expect(newlyUnlocked(s, { visited: ['chats', 'posts', 'reels', 'photos', 'you'] })).toContain('explorer');
  });

  it('returns nothing when signed out', () => {
    expect(newlyUnlocked({ ...base(), user: null })).toEqual([]);
  });

  it('headline picks the highest tier', () => {
    expect(headline(['first_post', 'data_owner', 'director'])?.id).toBe('data_owner');
    expect(headline([])).toBeUndefined();
  });
});

describe('nextSteps', () => {
  it('suggests up to three undone steps and tracks completion', () => {
    const s = base();
    const first = nextSteps(s);
    expect(first.steps).toHaveLength(3);
    expect(first.done).toBe(0);
    s.importJobs = [{
      id: 'j', platform: 'whatsapp', fileName: 'x.txt', conversationId: 'cv', status: 'completed', createdAt: LATER, total: 1, cursor: 1,
      imported: 1, skipped: 0, failed: 0, results: [], dateOrder: 'DMY', me: null,
    }];
    const after = nextSteps(s);
    expect(after.done).toBe(1);
    expect(after.steps.map(x => x.id)).not.toContain('import');
  });
});
