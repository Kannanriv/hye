import { useSyncExternalStore } from 'react';

import { demoStories } from './demo';

// Stories are demo-only and ephemeral, so "seen" lives in memory for this session.

const STORIES = demoStories();
let seen = new Set<string>();
const listeners = new Set<() => void>();

export const storyContactIds = Object.keys(STORIES);

export function storyImages(contactId: string): string[] {
  return STORIES[contactId] ?? [];
}

export function markStorySeen(contactId: string) {
  if (seen.has(contactId)) return;
  seen = new Set(seen).add(contactId);
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Set of contact ids whose stories you've opened this session. */
export function useSeenStories(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => seen, () => seen);
}
