import { useMemo } from 'react';

import type { Contact, User } from '@/domain/types';

export interface ReelAuthor {
  id: string;
  name: string;
  firstName: string;
  avatarUrl?: string;
  isDemo: boolean;
  isMe: boolean;
  following: boolean;
}

/** Stable author lookup for 'me' and contacts. Objects only change when contacts or the user change. */
export function useReelPeople(contacts: Contact[], user: User | null): (id: string) => ReelAuthor {
  return useMemo(() => {
    const map = new Map<string, ReelAuthor>();
    const meName = user?.displayName || 'You';
    map.set('me', { id: 'me', name: meName, firstName: meName.split(' ')[0], isDemo: false, isMe: true, following: false });
    for (const c of contacts) {
      map.set(c.id, {
        id: c.id, name: c.displayName, firstName: c.displayName.split(' ')[0], avatarUrl: c.avatarUrl,
        isDemo: c.isDemo, isMe: false, following: !!c.following,
      });
    }
    const unknown: ReelAuthor = { id: '?', name: 'Someone', firstName: 'Someone', isDemo: false, isMe: false, following: false };
    return (id: string) => map.get(id) ?? unknown;
  }, [contacts, user?.displayName]);
}

/** "5m", "3h", "2d" style relative time for comments. */
export function shortAgo(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d` : `${Math.round(d / 7)}w`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
