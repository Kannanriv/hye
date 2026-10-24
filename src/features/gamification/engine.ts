import type { AppState, Post } from '@/domain/types';

// Ethical gamification engine. Pure functions only, so everything here is unit-testable.
// XP and achievements come exclusively from real progress the person made in hye:
// no streaks, no time-spent rewards, no randomness, and diminishing returns so volume can't farm XP.

export type Tier = 'bronze' | 'silver' | 'gold';

/** Things the engine needs that don't live in AppState (kept feature-local). */
export interface GamContext {
  /** Main tabs the person has opened at least once. */
  visited: readonly string[];
}

export const MAIN_TABS = ['chats', 'posts', 'reels', 'photos', 'you'] as const;
export type MainTab = (typeof MAIN_TABS)[number];

const EMPTY_CTX: GamContext = { visited: [] };

// ---------- Facts derived from state ----------

export interface Facts {
  profileName: boolean;
  profileHandle: boolean;
  profileBio: boolean;
  messagesSent: number;
  groupsCreated: number;
  textPosts: number;
  photos: number;
  reels: number;
  /** Comments plus replies written on posts. */
  comments: number;
  /** Replies to someone else's post. */
  replies: number;
  importsCompleted: number;
  privacyReviewed: boolean;
  dataExported: boolean;
  savedPosts: number;
  savedLinks: number;
  timersSet: number;
  tabsVisited: number;
}

const mine = (p: Post) => p.authorId === 'me' && !p.simulated;
const hasAudit = (s: AppState, ...actions: string[]) => s.audit.filter(e => actions.includes(e.action)).length;

export function factsFor(s: AppState, ctx: GamContext = EMPTY_CTX): Facts {
  const user = s.user;
  const since = user?.createdAt ?? '';
  const native = new Set(s.conversations.filter(c => c.origin === 'native').map(c => c.id));
  // Demo chats are seeded with a few lines "from you" before sign-up; only count what was really sent.
  const messagesSent = s.messages.filter(m => m.senderId === 'me' && !m.system && !m.deletedAt && native.has(m.conversationId) && m.sentAt >= since).length;
  const own = s.posts.filter(mine);
  const roots = own.filter(p => !p.replyToId);
  const byId = new Map(s.posts.map(p => [p.id, p]));
  const replies = own.filter(p => p.replyToId && byId.get(p.replyToId)?.authorId !== 'me').length;
  let comments = own.filter(p => p.replyToId).length;
  for (const p of s.posts) for (const c of p.comments) if (c.authorId === 'me' && c.createdAt >= since) comments++;
  return {
    profileName: !!user?.displayName.trim(),
    profileHandle: !!user?.handle?.trim(),
    profileBio: !!user?.bio?.trim(),
    messagesSent,
    groupsCreated: hasAudit(s, 'group.created'),
    textPosts: roots.filter(p => p.kind === 'text').length,
    photos: own.filter(p => p.kind === 'photo').length,
    reels: own.filter(p => p.kind === 'reel').length,
    comments,
    replies,
    importsCompleted: Math.max(s.importJobs.filter(j => j.status === 'completed').length, hasAudit(s, 'import.completed')),
    privacyReviewed: hasAudit(s, 'privacy.changed') > 0,
    dataExported: hasAudit(s, 'data.exported', 'conversation.exported') > 0,
    savedPosts: s.posts.filter(p => p.saved).length,
    savedLinks: s.savedLinks.length,
    timersSet: hasAudit(s, 'retention.changed'),
    tabsVisited: MAIN_TABS.filter(t => ctx.visited.includes(t)).length,
  };
}

// ---------- XP ----------

/**
 * Diminishing returns: the n-th action is worth base/n (harmonic), capped per category.
 * The first post earns 20, the tenth earns 2, and nothing past the cap.
 */
export function diminishing(count: number, base: number, cap: number): number {
  let total = 0;
  for (let i = 1; i <= count && total < cap; i++) total += base / i;
  return Math.min(cap, Math.round(total));
}

export const TIER_XP: Record<Tier, number> = { bronze: 10, silver: 25, gold: 50 };

export interface XpBreakdown {
  category: string;
  xp: number;
  cap: number;
}

export function xpBreakdown(s: AppState, ctx: GamContext = EMPTY_CTX): XpBreakdown[] {
  const f = factsFor(s, ctx);
  const tierById = new Map(ACHIEVEMENTS.map(a => [a.id, a.tier]));
  const achievementXp = s.progress.achievements.reduce((n, a) => n + (TIER_XP[tierById.get(a.id) ?? 'bronze'] ?? 0), 0);
  return [
    { category: 'Profile', xp: (f.profileName ? 10 : 0) + (f.profileHandle ? 15 : 0) + (f.profileBio ? 15 : 0), cap: 40 },
    { category: 'Messages', xp: diminishing(f.messagesSent, 10, 60), cap: 60 },
    { category: 'Groups', xp: diminishing(f.groupsCreated, 30, 90), cap: 90 },
    { category: 'Posts', xp: diminishing(f.textPosts, 20, 100), cap: 100 },
    { category: 'Photos', xp: diminishing(f.photos, 25, 120), cap: 120 },
    { category: 'Reels', xp: diminishing(f.reels, 30, 140), cap: 140 },
    { category: 'Comments', xp: diminishing(f.comments, 10, 80), cap: 80 },
    { category: 'Imports', xp: diminishing(f.importsCompleted, 40, 120), cap: 120 },
    { category: 'Privacy', xp: f.privacyReviewed ? 30 : 0, cap: 30 },
    { category: 'Your data', xp: f.dataExported ? 40 : 0, cap: 40 },
    { category: 'Saved links', xp: diminishing(f.savedLinks, 5, 30), cap: 30 },
    { category: 'Achievements', xp: achievementXp, cap: ACHIEVEMENTS.reduce((n, a) => n + TIER_XP[a.tier], 0) },
    { category: 'Bonus', xp: Math.max(0, s.progress.xp), cap: Infinity },
  ];
}

export function computeXp(s: AppState, ctx: GamContext = EMPTY_CTX): number {
  return xpBreakdown(s, ctx).reduce((n, b) => n + b.xp, 0);
}

// ---------- Levels ----------

export const LEVELS: readonly { min: number; title: string }[] = [
  { min: 0, title: 'Newcomer' },
  { min: 60, title: 'Conversationalist' },
  { min: 180, title: 'Storyteller' },
  { min: 360, title: 'Connector' },
  { min: 600, title: 'Curator' },
  { min: 900, title: 'Trailblazer' },
];

export interface LevelInfo {
  level: number;
  title: string;
  /** XP floor of the current level. */
  current: number;
  /** XP needed for the next level, or null at the top level. */
  next: number | null;
  /** 0..1 progress through the current level (1 at the top level). */
  pct: number;
  nextTitle: string | null;
}

export function levelFor(xp: number): LevelInfo {
  const safe = Math.max(0, Number.isFinite(xp) ? xp : 0);
  let i = 0;
  while (i + 1 < LEVELS.length && safe >= LEVELS[i + 1].min) i++;
  const cur = LEVELS[i];
  const nxt = LEVELS[i + 1];
  return {
    level: i + 1,
    title: cur.title,
    current: cur.min,
    next: nxt ? nxt.min : null,
    pct: nxt ? (safe - cur.min) / (nxt.min - cur.min) : 1,
    nextTitle: nxt ? nxt.title : null,
  };
}

// ---------- Achievements ----------

export interface AchievementDef {
  id: string;
  title: string;
  /** Doubles as the how-to-unlock hint, so it's always phrased as an action. */
  description: string;
  icon: string; // Ionicons name
  tier: Tier;
  test: (f: Facts) => boolean;
  /** Optional progress toward the goal, for hints like "3 of 5". */
  progress?: (f: Facts) => { current: number; target: number };
}

const count = (target: number, pick: (f: Facts) => number) => (f: Facts) => ({ current: Math.min(target, pick(f)), target });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'profile_complete', title: 'Profile complete', description: 'Add your name, a username and a short bio.', icon: 'person-circle-outline', tier: 'bronze',
    test: f => f.profileName && f.profileHandle && f.profileBio,
    progress: count(3, f => Number(f.profileName) + Number(f.profileHandle) + Number(f.profileBio)) },
  { id: 'first_hello', title: 'First hello', description: 'Send a message in any chat.', icon: 'chatbubble-ellipses-outline', tier: 'bronze', test: f => f.messagesSent > 0 },
  { id: 'group_founder', title: 'Group founder', description: 'Create a group for people you care about.', icon: 'people-outline', tier: 'silver', test: f => f.groupsCreated > 0 },
  { id: 'first_post', title: 'First post', description: 'Share a thought on Posts.', icon: 'create-outline', tier: 'bronze', test: f => f.textPosts > 0 },
  { id: 'shutterbug', title: 'Shutterbug', description: 'Share your first photo with your contacts.', icon: 'camera-outline', tier: 'bronze', test: f => f.photos > 0 },
  { id: 'director', title: 'Director', description: 'Share your first reel.', icon: 'film-outline', tier: 'silver', test: f => f.reels > 0 },
  { id: 'well_rounded', title: 'Well rounded', description: 'Share a post, a photo and a reel.', icon: 'color-palette-outline', tier: 'gold',
    test: f => f.textPosts > 0 && f.photos > 0 && f.reels > 0,
    progress: count(3, f => Number(f.textPosts > 0) + Number(f.photos > 0) + Number(f.reels > 0)) },
  { id: 'kind_words', title: 'Kind words', description: 'Reply to someone else’s post.', icon: 'return-down-forward-outline', tier: 'bronze', test: f => f.replies > 0 },
  { id: 'good_listener', title: 'Good listener', description: 'Leave 5 comments or replies on posts.', icon: 'ear-outline', tier: 'silver',
    test: f => f.comments >= 5, progress: count(5, f => f.comments) },
  { id: 'bookmarker', title: 'Bookmarker', description: 'Save a post to come back to later.', icon: 'bookmark-outline', tier: 'bronze', test: f => f.savedPosts > 0 },
  { id: 'link_keeper', title: 'Link keeper', description: 'Save a link in Saved links.', icon: 'link-outline', tier: 'bronze', test: f => f.savedLinks > 0 },
  { id: 'memory_keeper', title: 'Memory keeper', description: 'Import a chat from WhatsApp.', icon: 'archive-outline', tier: 'silver', test: f => f.importsCompleted > 0 },
  { id: 'privacy_pro', title: 'Privacy pro', description: 'Review your privacy settings.', icon: 'shield-checkmark-outline', tier: 'silver', test: f => f.privacyReviewed },
  { id: 'tidy_up', title: 'Tidy up', description: 'Set a disappearing-message timer on a chat.', icon: 'timer-outline', tier: 'silver', test: f => f.timersSet > 0 },
  { id: 'data_owner', title: 'Data owner', description: 'Export a copy of your data.', icon: 'download-outline', tier: 'gold', test: f => f.dataExported },
  { id: 'explorer', title: 'Explorer', description: 'Open Chats, Posts, Reels, Photos and You.', icon: 'compass-outline', tier: 'bronze',
    test: f => f.tabsVisited >= MAIN_TABS.length, progress: count(MAIN_TABS.length, f => f.tabsVisited) },
];

export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDef> = new Map(ACHIEVEMENTS.map(a => [a.id, a]));

/** Ids whose condition is now met but that aren't recorded in progress yet. */
export function newlyUnlocked(s: AppState, ctx: GamContext = EMPTY_CTX): string[] {
  if (!s.user) return [];
  const have = new Set(s.progress.achievements.map(a => a.id));
  const f = factsFor(s, ctx);
  return ACHIEVEMENTS.filter(a => !have.has(a.id) && a.test(f)).map(a => a.id);
}

const TIER_RANK: Record<Tier, number> = { gold: 3, silver: 2, bronze: 1 };

/** The most notable of several ids (highest tier, then catalogue order). */
export function headline(ids: readonly string[]): AchievementDef | undefined {
  return ids
    .map(id => ACHIEVEMENT_BY_ID.get(id))
    .filter((a): a is AchievementDef => !!a)
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])[0];
}

// ---------- Next steps ----------

export interface NextStep {
  id: string;
  label: string;
  detail: string;
  icon: string;
  href: string;
  done: (f: Facts) => boolean;
}

/** Meaningful actions, in the order we suggest them. Only undone ones are shown. */
export const NEXT_STEPS: readonly NextStep[] = [
  { id: 'profile', label: 'Finish your profile', detail: 'Add a username and a short bio so friends recognise you.', icon: 'person-outline', href: '/(tabs)/you',
    done: f => f.profileHandle && f.profileBio },
  { id: 'import', label: 'Import your WhatsApp history', detail: 'Bring old chats along. They stay on this device.', icon: 'download-outline', href: '/import', done: f => f.importsCompleted > 0 },
  { id: 'photo', label: 'Share your first photo with contacts', detail: 'Only your contacts see photos by default.', icon: 'camera-outline', href: '/(tabs)/photos', done: f => f.photos > 0 },
  { id: 'privacy', label: 'Review your privacy settings', detail: 'Choose who sees read receipts and when you were online.', icon: 'shield-checkmark-outline', href: '/settings/privacy', done: f => f.privacyReviewed },
  { id: 'post', label: 'Post your first thought', detail: 'A short update for the people who follow you.', icon: 'create-outline', href: '/(tabs)/posts', done: f => f.textPosts > 0 },
  { id: 'group', label: 'Start a group', detail: 'Plan something with friends or family.', icon: 'people-outline', href: '/(tabs)/communities', done: f => f.groupsCreated > 0 },
  { id: 'export', label: 'Export a copy of your data', detail: 'It’s yours. Take it anywhere.', icon: 'cloud-download-outline', href: '/settings/data', done: f => f.dataExported },
];

export function nextSteps(s: AppState, ctx: GamContext = EMPTY_CTX, limit = 3): { steps: NextStep[]; done: number; total: number } {
  const f = factsFor(s, ctx);
  const open = NEXT_STEPS.filter(n => !n.done(f));
  return { steps: open.slice(0, limit), done: NEXT_STEPS.length - open.length, total: NEXT_STEPS.length };
}
