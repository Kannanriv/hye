import { Href, router } from 'expo-router';
import { useMemo } from 'react';

import type { Contact, Post } from '@/domain/types';
import { useStore } from '@/state/store';

export interface Person {
  id: string;
  name: string;
  firstName: string;
  avatarUrl?: string;
  isDemo: boolean;
}

/** Lookup for authors, likers and commenters: 'me' plus contacts. */
export function usePeople(): (id: string) => Person {
  const { state } = useStore();
  const { contacts, user } = state;
  return useMemo(() => {
    const map = new Map<string, Contact>(contacts.map(c => [c.id, c]));
    const meName = user?.displayName || 'You';
    const cache = new Map<string, Person>();
    return (id: string) => {
      const hit = cache.get(id);
      if (hit) return hit;
      let person: Person;
      if (id === 'me') person = { id, name: meName, firstName: 'You', isDemo: false };
      else {
        const c = map.get(id);
        const name = c?.displayName ?? 'Someone';
        person = { id, name, firstName: name.split(' ')[0], avatarUrl: c?.avatarUrl, isDemo: c?.isDemo ?? false };
      }
      cache.set(id, person);
      return person;
    };
  }, [contacts, user?.displayName]);
}

/** Instagram-style relative time: "Just now", "5 minutes ago", "3 days ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'Just now';
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'} ago`;
  if (s < 3600) return unit(Math.floor(s / 60), 'minute');
  if (s < 86_400) return unit(Math.floor(s / 3600), 'hour');
  if (s < 7 * 86_400) return unit(Math.floor(s / 86_400), 'day');
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

/** Short form for comments: "5m", "3h", "2d". */
export function timeShort(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return `${Math.floor(s / (7 * 86_400))}w`;
}

/** "Liked by Ava and 6 others", preferring you, then the first contact who liked it. */
export function likedByLine(post: Post, person: (id: string) => Person): string | null {
  const n = post.likes.length;
  if (!n) return null;
  const meLiked = post.likes.includes('me');
  const first = meLiked ? 'you' : person(post.likes[0]).firstName;
  if (n === 1) return `Liked by ${first}`;
  return `Liked by ${first} and ${n - 1} ${n - 1 === 1 ? 'other' : 'others'}`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Routes added by this feature aren't in the generated typed-routes file until the dev server
// regenerates it, so navigation goes through these small helpers.
export const go = {
  photo: (id: string, focusComment = false) => router.push(`/photo/${id}${focusComment ? '?focus=1' : ''}` as Href),
  newPhoto: () => router.push('/photo/new' as Href),
  story: (contactId: string) => router.push(`/story/${contactId}` as Href),
  back: () => (router.canGoBack() ? router.back() : router.replace('/photos' as Href)),
};
