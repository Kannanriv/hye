import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { MAIN_TABS, MainTab } from './engine';

// Which main tabs the person has opened, for the Explorer achievement. Feature-local on purpose:
// it's a tiny convenience list, not part of the synced app state.
const KEY = 'hye/gam/visited';

let visited: readonly string[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then(raw => {
      const saved: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(saved)) {
        visited = [...new Set([...visited, ...saved.filter((x): x is string => typeof x === 'string')])];
        emit();
      }
    })
    .catch(() => undefined);
}

export function recordVisit(tab: MainTab) {
  load();
  if (visited.includes(tab)) return;
  visited = [...visited, tab];
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(visited)).catch(() => undefined);
}

/** Maps an expo-router pathname to a main tab, if it is one. */
export function tabForPath(path: string): MainTab | null {
  if (path === '/' || path === '/index') return 'chats';
  const seg = path.replace(/^\/(\(tabs\)\/)?/, '').split('/')[0];
  return (MAIN_TABS as readonly string[]).includes(seg) ? (seg as MainTab) : null;
}

const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const snapshot = () => visited;

export function useVisitedTabs(): readonly string[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
