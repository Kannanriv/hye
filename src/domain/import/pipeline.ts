import { hash, newId } from '../hash';
import type { Attachment, ImportItemResult, ImportJob, Message } from '../types';
import { DateOrder, ParsedExport, ParsedRecord, recordTimestamp } from './whatsapp';

export interface ArchiveFile {
  name: string;
  /** Saved location on device, filled in once the file has been copied out of the archive. */
  uri?: string;
}

export interface PlannedItem {
  ref: string; // "lines 12-14"
  sourceKey: string;
  message?: Omit<Message, 'id' | 'conversationId'>;
  error?: string;
}

export interface ImportPreview {
  participants: string[];
  firstAt: string | null;
  lastAt: string | null;
  messages: number;
  systemNotices: number;
  deletedPlaceholders: number;
  edited: number;
  attachmentsIncluded: number;
  attachmentsMissingFromArchive: number;
  attachmentsOmittedByExport: number;
  duplicates: number;
  invalid: number;
  orphanLines: number;
  notPreserved: string[];
}

/** Things WhatsApp's export format cannot carry. Shown verbatim to the user before import. */
export const WHATSAPP_NOT_PRESERVED = [
  'Time zones: timestamps are the exporting phone’s local time',
  'Reactions',
  'Reply and quote links between messages',
  'Read receipts and delivery status',
  'Phone numbers of contacts saved by name',
  'Polls, view-once media and call details',
];

function attachmentKind(fileName: string): Attachment['kind'] {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic'].includes(ext) || /^image/i.test(fileName)) return 'image';
  if (['mp4', 'mov', '3gp', 'mkv'].includes(ext) || /^video/i.test(fileName)) return 'video';
  if (['opus', 'mp3', 'm4a', 'aac', 'ogg', 'wav'].includes(ext) || /^audio/i.test(fileName)) return 'audio';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'vcf'].includes(ext)) return 'document';
  return 'other';
}

/**
 * Turns parsed records into planned messages with stable source keys. Identical records
 * (same time, sender, text) get an occurrence suffix so genuine repeats survive dedupe.
 */
export function planImport(
  parsed: ParsedExport,
  order: DateOrder,
  conversationKey: string,
  archive: ArchiveFile[] | null,
  me: string | null,
): PlannedItem[] {
  const seen = new Map<string, number>();
  const files = new Map((archive ?? []).map(f => [f.name, f]));
  return parsed.records.map((r: ParsedRecord) => {
    const ref = r.lineStart === r.lineEnd ? `line ${r.lineStart}` : `lines ${r.lineStart}-${r.lineEnd}`;
    const sentAt = recordTimestamp(r, order);
    const base = `wa|${conversationKey}|${sentAt ?? r.date.join('/')}|${r.sender ?? '~system'}|${hash(r.text)}|${r.attachments.map(a => a.fileName).join(',')}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const sourceKey = hash(`${base}|${n}`);
    if (!sentAt) return { ref, sourceKey, error: `Unreadable date ${r.date.join('/')} for the chosen date order` };

    const attachments: Attachment[] = r.attachments.map(a => {
      const file = files.get(a.fileName);
      const kind = attachmentKind(a.fileName);
      if (!a.included) return { id: newId('att'), kind, fileName: a.fileName, missingReason: 'Media was not included in the export' };
      if (!file) return { id: newId('att'), kind, fileName: a.fileName, missingReason: archive ? 'File not found in the archive' : 'Upload the .zip export to include files' };
      return { id: newId('att'), kind, fileName: a.fileName, uri: file.uri };
    });

    const isMe = !!me && r.sender === me;
    return {
      ref,
      sourceKey,
      message: {
        senderId: isMe ? 'me' : r.sender ?? 'system',
        senderName: r.sender ?? 'WhatsApp',
        text: r.kind === 'deleted' ? '' : r.text,
        sentAt,
        editedAt: r.edited ? sentAt : undefined, // export marks edits but not when they happened
        deletedAt: r.kind === 'deleted' ? sentAt : undefined,
        reactions: [],
        attachments,
        system: r.kind === 'system',
        sourceKey,
        sourceRef: ref,
      },
    };
  });
}

export function previewImport(parsed: ParsedExport, plan: PlannedItem[], existingKeys: Set<string>): ImportPreview {
  const valid = plan.filter(p => p.message);
  const times = valid.map(p => p.message!.sentAt).sort();
  const atts = valid.flatMap(p => p.message!.attachments);
  return {
    participants: parsed.participants,
    firstAt: times[0] ?? null,
    lastAt: times[times.length - 1] ?? null,
    messages: valid.filter(p => !p.message!.system && !p.message!.deletedAt).length,
    systemNotices: valid.filter(p => p.message!.system).length,
    deletedPlaceholders: valid.filter(p => p.message!.deletedAt).length,
    edited: valid.filter(p => p.message!.editedAt).length,
    attachmentsIncluded: atts.filter(a => !a.missingReason).length,
    attachmentsMissingFromArchive: atts.filter(a => a.missingReason && a.missingReason !== 'Media was not included in the export').length,
    attachmentsOmittedByExport: atts.filter(a => a.missingReason === 'Media was not included in the export').length,
    duplicates: plan.filter(p => existingKeys.has(p.sourceKey)).length,
    invalid: plan.length - valid.length,
    orphanLines: parsed.orphanLines.length,
    notPreserved: WHATSAPP_NOT_PRESERVED,
  };
}

export interface BatchOutcome {
  job: ImportJob;
  newMessages: Message[];
}

/**
 * Processes up to `batchSize` planned items starting at job.cursor. Pure: callers persist the
 * returned job + messages together, so a crash between batches resumes from the saved cursor
 * and already-imported keys are skipped (idempotent).
 */
export function runImportBatch(
  job: ImportJob,
  plan: PlannedItem[],
  existingKeys: Set<string>,
  batchSize = 200,
): BatchOutcome {
  const end = Math.min(job.cursor + batchSize, plan.length);
  const results: ImportItemResult[] = [];
  const newMessages: Message[] = [];
  let { imported, skipped, failed } = job;

  for (let i = job.cursor; i < end; i++) {
    const item = plan[i];
    if (item.error) {
      failed++;
      results.push({ ref: item.ref, outcome: 'failed', reason: item.error });
    } else if (existingKeys.has(item.sourceKey)) {
      skipped++;
      results.push({ ref: item.ref, outcome: 'skipped', reason: 'Already imported' });
    } else {
      existingKeys.add(item.sourceKey);
      imported++;
      newMessages.push({ ...item.message!, id: newId('msg'), conversationId: job.conversationId });
    }
  }

  const done = end >= plan.length;
  return {
    newMessages,
    job: {
      ...job,
      cursor: end,
      imported,
      skipped,
      failed,
      // Keep skipped/failed details for the report; successes are counted, not listed.
      results: [...job.results, ...results],
      status: done ? 'completed' : 'importing',
      completedAt: done ? new Date().toISOString() : undefined,
    },
  };
}

/** Machine-readable migration report the user can save or share. */
export function migrationReport(job: ImportJob, preview: ImportPreview | null) {
  return {
    format: 'hye-migration-report/1',
    jobId: job.id,
    source: job.platform,
    file: job.fileName,
    startedAt: job.createdAt,
    completedAt: job.completedAt ?? null,
    status: job.status,
    dateOrder: job.dateOrder,
    totals: { records: job.total, imported: job.imported, skipped: job.skipped, failed: job.failed },
    notPreservedBySource: preview?.notPreserved ?? WHATSAPP_NOT_PRESERVED,
    items: job.results,
  };
}
