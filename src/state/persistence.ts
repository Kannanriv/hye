import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppState, Message } from '@/domain/types';
import { clearAppFiles } from '@/services/importer';
import { initialState } from './demo';

// State is stored in small pieces: one "meta" record (everything except messages) plus
// message chunks per conversation. Android's AsyncStorage reads each row through a ~2 MB
// window, so one big JSON blob would silently fail to load after a large import.
// Only chunks whose messages changed (by reference — messages are immutable) are rewritten.

const PREFIX = 'hye/';
const META_KEY = 'hye/v2/meta';
const LEGACY_KEY = 'hye/state/v1';
const CHUNK = 1500;
const META = '__meta';

/** Last-written chunk contents, keyed by storage key. META holds the meta JSON string. */
export type PersistedChunks = Map<string, Message[] | string>;

type Meta = Omit<AppState, 'messages'> & { chunkKeys: string[] };

function chunkKey(conversationId: string, i: number) {
  return `${PREFIX}v2/msgs/${conversationId}/${i}`;
}

function buildChunks(messages: Message[]): Map<string, Message[]> {
  const byConv = new Map<string, Message[]>();
  for (const m of messages) {
    const list = byConv.get(m.conversationId);
    if (list) list.push(m);
    else byConv.set(m.conversationId, [m]);
  }
  const chunks = new Map<string, Message[]>();
  for (const [convId, list] of byConv) {
    for (let i = 0; i * CHUNK < list.length; i++) chunks.set(chunkKey(convId, i), list.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  return chunks;
}

const sameRefs = (a: Message[], b: Message[]) => a.length === b.length && a.every((m, i) => m === b[i]);

export async function saveState(state: AppState, previous: PersistedChunks): Promise<PersistedChunks> {
  const chunks = buildChunks(state.messages);
  const { messages: _messages, ...rest } = state;
  const metaJson = JSON.stringify({ ...rest, chunkKeys: [...chunks.keys()] } satisfies Meta);

  const writes: [string, string][] = [];
  for (const [key, list] of chunks) {
    const before = previous.get(key);
    if (!Array.isArray(before) || !sameRefs(before, list)) writes.push([key, JSON.stringify(list)]);
  }
  // Chunks first, then the meta record that points at them, then remove orphans.
  if (writes.length) await AsyncStorage.multiSet(writes);
  if (previous.get(META) !== metaJson) await AsyncStorage.setItem(META_KEY, metaJson);
  const stale = [...previous.keys()].filter(k => k !== META && !chunks.has(k));
  if (previous.size === 0) stale.push(LEGACY_KEY);
  if (stale.length) await AsyncStorage.multiRemove(stale);

  const next: PersistedChunks = new Map(chunks);
  next.set(META, metaJson);
  return next;
}

/** Loads saved state. Throws if data exists but can't be read, so callers never overwrite it. */
export async function loadState(): Promise<{ state: AppState | null; chunks: PersistedChunks }> {
  const metaRaw = await AsyncStorage.getItem(META_KEY);
  if (!metaRaw) {
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    return { state: legacy ? { ...initialState, ...JSON.parse(legacy) } : null, chunks: new Map() };
  }
  const { chunkKeys, ...meta } = JSON.parse(metaRaw) as Meta;
  const rows = chunkKeys.length ? await AsyncStorage.multiGet(chunkKeys) : [];
  const chunks: PersistedChunks = new Map([[META, metaRaw]]);
  const messages: Message[] = [];
  for (const [key, raw] of rows) {
    if (raw == null) throw new Error(`Missing chunk ${key}`);
    const list = JSON.parse(raw) as Message[];
    chunks.set(key, list);
    messages.push(...list);
  }
  return { state: { ...initialState, ...meta, messages }, chunks };
}

/** Removes every hye record from storage, plus imported files and cached exports. */
export async function clearStorage() {
  const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
  clearAppFiles();
}
