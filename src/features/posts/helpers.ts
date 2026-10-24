import { Href, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import type { AppState, Contact, Post } from '@/domain/types';

export const POST_LIMIT = 280;

export interface Author {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string;
  isDemo: boolean;
  bio?: string;
  following?: boolean;
}

/** Map of every author id ('me' + contacts) to display info. Stable while user/contacts are unchanged. */
export function useAuthors(state: AppState): Map<string, Author> {
  const { user, contacts } = state;
  return useMemo(() => {
    const map = new Map<string, Author>();
    if (user) {
      map.set('me', {
        id: 'me', name: user.displayName, handle: user.handle ?? handleFrom(user.displayName), isDemo: false, bio: user.bio,
      });
    }
    contacts.forEach((c: Contact) => map.set(c.id, {
      id: c.id, name: c.displayName, handle: c.handle, avatarUrl: c.avatarUrl, isDemo: c.isDemo, bio: c.bio, following: c.following,
    }));
    return map;
  }, [user, contacts]);
}

export const UNKNOWN_AUTHOR: Author = { id: '?', name: 'Someone', handle: 'unknown', isDemo: false };

function handleFrom(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 15) || 'you';
}

/** Twitter-style compact relative time: now, 5m, 3h, 2d, 12 Oct. */
export function relativeTime(iso: string, now: number): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Spoken form of relativeTime for screen readers. */
export function relativeTimeLong(iso: string, now: number): string {
  const short = relativeTime(iso, now);
  if (short === 'now') return 'just now';
  const m = /^(\d+)([mhd])$/.exec(short);
  if (!m) return short;
  const unit = { m: 'minute', h: 'hour', d: 'day' }[m[2] as 'm' | 'h' | 'd'];
  return `${m[1]} ${unit}${m[1] === '1' ? '' : 's'} ago`;
}

/** Re-renders every `ms` so relative times stay fresh. */
export function useNow(ms = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export const charCount = (text: string) => Array.from(text).length;

/** Number of direct replies per post id. */
export function useReplyCounts(posts: Post[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach(p => { if (p.replyToId) counts.set(p.replyToId, (counts.get(p.replyToId) ?? 0) + 1); });
    return counts;
  }, [posts]);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The new routes are not in the generated typed-routes file until the next `expo start`, hence the casts.
export const openPost = (id: string) => router.push(`/post/${id}` as Href);
export const openCompose = (params: { replyTo?: string; quote?: string } = {}) => {
  const q = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
  router.push(`/post/compose${q ? `?${q}` : ''}` as Href);
};

export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
export function sample<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
