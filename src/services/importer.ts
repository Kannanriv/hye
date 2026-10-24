import { Directory, File, Paths } from 'expo-file-system';
import { strFromU8, unzipSync } from 'fflate';
import { Platform } from 'react-native';

import { hash, newId } from '@/domain/hash';
import { ArchiveFile, planImport, PlannedItem, previewImport, ImportPreview } from '@/domain/import/pipeline';
import { DateOrder, parseWhatsAppExport, ParsedExport, titleFromFileName } from '@/domain/import/whatsapp';
import type { AppState, Conversation, ImportJob } from '@/domain/types';

export const MAX_EXPORT_BYTES = 250 * 1024 * 1024;
const MAX_TEXT_BYTES = 50 * 1024 * 1024;
const MAX_UNZIPPED_BYTES = 1024 * 1024 * 1024;
const MAX_ENTRY_BYTES = 300 * 1024 * 1024;
const MAX_ENTRIES = 5000;
/** Executables, scripts and active content. Never stored, never offered for sharing. */
export const BLOCKED_EXTENSIONS = /\.(exe|apk|apks|xapk|aab|dex|ipa|bat|cmd|com|scr|msi|js|mjs|jar|sh|ps1|vbs|dll|lnk|hta|html?|svg)$/i;

export class ImportError extends Error {}

export interface LoadedExport {
  fileName: string;
  text: string;
  /** Media inside a .zip export, held in memory until the user confirms the import. */
  media: Map<string, Uint8Array>;
  skippedFiles: string[];
}

async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  return new File(uri).bytes();
}

/** Step 5 of the migration flow: validate file type, size and archive structure. */
export async function loadExport(asset: { uri: string; name: string; size?: number }): Promise<LoadedExport> {
  const name = asset.name;
  if (!/\.(txt|zip)$/i.test(name)) throw new ImportError('Choose the .txt or .zip file that WhatsApp created when you exported the chat.');
  const size = asset.size ?? (Platform.OS === 'web' ? undefined : new File(asset.uri).size);
  if (size == null) throw new ImportError('We couldn’t check the size of this file. Save it to your phone first, then try again.');
  const isText = /\.txt$/i.test(name);
  if (size > (isText ? MAX_TEXT_BYTES : MAX_EXPORT_BYTES)) {
    throw new ImportError(`This file is larger than ${isText ? 50 : 250} MB. Export the chat again “Without media”, or export a shorter time range.`);
  }

  const bytes = await readBytes(asset.uri);
  if (isText) return { fileName: name, text: strFromU8(bytes), media: new Map(), skippedFiles: [] };

  // Check declared sizes before inflating anything, so a zip bomb can't exhaust memory.
  let total = 0;
  let count = 0;
  const skippedFiles: string[] = [];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: f => {
        if (++count > MAX_ENTRIES) throw new ImportError('This archive has too many files to be a chat export.');
        total += f.originalSize;
        if (f.originalSize > MAX_ENTRY_BYTES || total > MAX_UNZIPPED_BYTES) throw new ImportError('This archive is too large once unpacked. Export the chat “Without media”.');
        const base = f.name.split('/').pop() ?? '';
        if (BLOCKED_EXTENSIONS.test(base) || base.startsWith('.')) {
          if (base) skippedFiles.push(base);
          return false;
        }
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('We couldn’t open this .zip file. It may be incomplete — try exporting the chat again.');
  }
  const names = Object.keys(entries).filter(n => !n.endsWith('/'));
  const chat = names.find(n => /(^|\/)_chat\.txt$/i.test(n)) ?? names.find(n => /WhatsApp Chat.*\.txt$/i.test(n)) ?? names.find(n => /\.txt$/i.test(n));
  if (!chat) throw new ImportError('This archive doesn’t contain a WhatsApp chat file (_chat.txt).');

  const media = new Map<string, Uint8Array>();
  for (const n of names) {
    if (n === chat) continue;
    const base = n.split('/').pop()!;
    // export.txt is reserved for our saved copy; duplicate names keep the first file.
    if (base === 'export.txt' || media.has(base)) skippedFiles.push(base);
    else media.set(base, entries[n]);
  }
  return { fileName: name, text: strFromU8(entries[chat]), media, skippedFiles };
}

export interface Analysis {
  parsed: ParsedExport;
  title: string;
  conversationKey: string;
}

export function analyse(loaded: LoadedExport): Analysis {
  const parsed = parseWhatsAppExport(loaded.text);
  if (parsed.records.length === 0) throw new ImportError('This file doesn’t look like a WhatsApp chat export. No messages were found.');
  if (parsed.possibleDateOrders.length === 0) throw new ImportError('Some dates in this file can’t be read in any format. The export may be damaged.');
  const title = titleFromFileName(loaded.fileName, parsed.participants);
  // Same chat exported again later -> same key, so overlapping history is deduplicated.
  const conversationKey = hash(`whatsapp|${title.toLowerCase()}|${[...parsed.participants].sort().join('|').toLowerCase()}`);
  return { parsed, title, conversationKey };
}

export function existingConversation(state: AppState, conversationKey: string): Conversation | undefined {
  return state.conversations.find(c => c.id === `imp_${conversationKey}`);
}

export function existingKeys(state: AppState, conversationId: string): Set<string> {
  return new Set(state.messages.filter(m => m.conversationId === conversationId && m.sourceKey).map(m => m.sourceKey!));
}

export function buildPreview(
  state: AppState, a: Analysis, loaded: LoadedExport, order: DateOrder, me: string | null,
): { plan: PlannedItem[]; preview: ImportPreview } {
  const archive: ArchiveFile[] | null = /\.zip$/i.test(loaded.fileName) ? [...loaded.media.keys()].map(name => ({ name })) : null;
  const plan = planImport(a.parsed, order, a.conversationKey, archive, me);
  return { plan, preview: previewImport(a.parsed, plan, existingKeys(state, `imp_${a.conversationKey}`)) };
}

function jobDir(jobId: string): Directory {
  const dir = new Directory(Paths.document, 'imports', jobId);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Copies the export and its media into app storage so the import can resume after a restart. */
export async function persistExport(jobId: string, loaded: LoadedExport): Promise<ArchiveFile[]> {
  if (Platform.OS === 'web') return [...loaded.media.keys()].map(name => ({ name }));
  const dir = jobDir(jobId);
  const source = new File(dir, 'export.txt');
  if (!source.exists) source.create();
  await source.write(loaded.text);
  const saved: ArchiveFile[] = [];
  for (const [name, bytes] of loaded.media) {
    const f = new File(dir, name);
    if (!f.exists) {
      f.create();
      await f.write(bytes);
    }
    saved.push({ name, uri: f.uri });
  }
  return saved;
}

/**
 * Reloads a saved export for resuming or retrying a job. Returns null if it is no longer on the device.
 * `fileName` must be the job's original name: the conversation key (and so every source key) derives from it.
 */
export async function reloadExport(jobId: string, fileName: string): Promise<{ loaded: LoadedExport; archive: ArchiveFile[] } | null> {
  if (Platform.OS === 'web') return null;
  const dir = new Directory(Paths.document, 'imports', jobId);
  const source = new File(dir, 'export.txt');
  if (!source.exists) return null;
  const archive = dir.list().filter((e): e is File => e instanceof File && e.name !== 'export.txt').map(f => ({ name: f.name, uri: f.uri }));
  return { loaded: { fileName, text: await source.text(), media: new Map(), skippedFiles: [] }, archive };
}

export function deleteImportFiles(jobId?: string) {
  if (Platform.OS === 'web') return;
  const dir = jobId ? new Directory(Paths.document, 'imports', jobId) : new Directory(Paths.document, 'imports');
  if (dir.exists) dir.delete();
}

/** Deletes imported files and everything in the cache (picked files, exports, reports). Best effort. */
export function clearAppFiles() {
  if (Platform.OS === 'web') return;
  try {
    deleteImportFiles();
  } catch {
    // keep going: the cache may still hold copies
  }
  for (const entry of Paths.cache.list()) {
    try {
      entry.delete();
    } catch {
      // in use by the OS; it will be cleared with the app's cache
    }
  }
}

export function newJob(platform: 'whatsapp', fileName: string, conversationId: string, total: number, order: DateOrder, me: string | null): ImportJob {
  return {
    id: newId('job'), platform, fileName, conversationId, status: 'importing', createdAt: new Date().toISOString(),
    total, cursor: 0, imported: 0, skipped: 0, failed: 0, results: [], dateOrder: order, me,
  };
}

/** Writes a JSON file to the cache directory and returns its URI (for sharing). */
export async function writeShareFile(name: string, data: unknown): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const f = new File(Paths.cache, name);
  if (f.exists) f.delete();
  f.create();
  await f.write(JSON.stringify(data, null, 2));
  return f.uri;
}

/**
 * Copies a picked file (usually in the OS-managed cache) into app storage so it survives
 * cache clearing. Returns the original URI on web or if the copy fails.
 */
export function keepFile(uri: string, folder: string): string {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'media', folder);
    if (!dir.exists) dir.create({ intermediates: true });
    const ext = /\.[a-z0-9]{2,5}$/i.exec(uri)?.[0] ?? '.jpg';
    const target = new File(dir, `${Date.now()}${ext}`);
    new File(uri).copy(target);
    return target.uri;
  } catch {
    return uri;
  }
}
