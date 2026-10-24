import {
  ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { newId, nowIso } from '../common/ids.js';
import type { ImportItemRecord, ImportJobRecord, MessageRecord, PlannedMessage } from '../persistence/records.js';
import type { CreateImportDto } from './dto/create-import.dto.js';
import {
  DuplicateImportError, IMPORTS_REPOSITORY, type ImportsRepository, type ImportsStore, type ItemOutcomeUpdate,
} from './imports.repository.js';

export const IMPORTS_OPTIONS = Symbol('IMPORTS_OPTIONS');

export interface ImportsOptions {
  /** Items processed (and committed) per batch. */
  batchSize: number;
  /** Batches processed per run() call before the job is paused for a later resume. */
  maxBatchesPerRun: number;
}

const MAX_TEXT = 65_536;
const MAX_REPORT_ITEMS = 1_000;
const ALREADY_IMPORTED = 'Already imported';
const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Exports often carry wall-clock time without a zone. Treat offset-less values as UTC
 * wall-clock so the stored instant equals what the export showed (the conversation's
 * provenance timezone note says so), instead of shifting by the server's zone.
 */
export function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  const ms = Date.parse(HAS_OFFSET.test(s) || !/T|\d:\d/.test(s) ? s : `${s}Z`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function jobView(job: ImportJobRecord, problems: ImportItemRecord[] = []) {
  return {
    id: job.id,
    platform: job.platform,
    fileName: job.fileName,
    conversationId: job.conversationId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? undefined,
    completedAt: job.completedAt ?? undefined,
    total: job.total,
    cursor: job.cursor,
    imported: job.imported,
    skipped: job.skipped,
    failed: job.failed,
    dateOrder: job.dateOrder,
    me: job.me,
    lastError: job.lastError ?? undefined,
    // Same shape as ImportItemResult in the client; successes are counted, not listed.
    results: problems.map(i => ({ ref: i.sourceRef, outcome: i.outcome!, reason: i.reason ?? undefined })),
  };
}

/**
 * Server side of the import pipeline (mirrors runImportBatch in the client):
 *
 *  - create(): idempotent on (owner, platform, file hash). Stages the client's planned
 *    items so processing survives restarts.
 *  - processBatch(): one transaction per batch: insert messages (duplicates by source key
 *    are ignored), record each item's outcome, advance the cursor. A crash mid-batch rolls
 *    the whole batch back; the cursor still points at it.
 *  - run()/resume(): loop batches; a budget pauses long jobs, errors mark the job failed.
 *    Both can be retried any number of times without duplicating messages.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger('Imports');
  private readonly running = new Set<string>();

  constructor(
    @Inject(IMPORTS_REPOSITORY) private readonly repo: ImportsRepository,
    @Inject(IMPORTS_OPTIONS) private readonly options: ImportsOptions,
    private readonly audit: AuditService,
  ) {}

  async create(ownerUserId: string, dto: CreateImportDto): Promise<{ job: ImportJobRecord; created: boolean }> {
    const existing = await this.repo.findJobByFileHash(ownerUserId, dto.platform, dto.fileHash);
    if (existing) return { job: existing, created: false };

    let job: ImportJobRecord;
    try {
      job = await this.repo.transaction(store => this.createInStore(store, ownerUserId, dto));
    } catch (err) {
      if (err instanceof DuplicateImportError) {
        // Lost a race with an identical request: the other one's job is the answer.
        const winner = await this.repo.findJobByFileHash(ownerUserId, dto.platform, dto.fileHash);
        if (winner) return { job: winner, created: false };
      }
      throw err;
    }
    await this.audit.record({
      userId: ownerUserId, action: 'import.created', targetType: 'import_job', targetId: job.id,
      detail: `${dto.platform}: ${job.total} records`, metadata: { platform: dto.platform, total: job.total },
    });
    return { job, created: true };
  }

  private async createInStore(store: ImportsStore, ownerUserId: string, dto: CreateImportDto): Promise<ImportJobRecord> {
    const now = nowIso();
    const jobId = newId();
    let conversationId = dto.conversationId;

    if (conversationId) {
      const conversation = await store.getConversation(conversationId);
      if (!conversation || !(await store.isConversationMember(conversationId, ownerUserId))) {
        throw new NotFoundException('Conversation not found');
      }
      if (conversation.origin !== 'imported' || conversation.sourcePlatform !== dto.platform) {
        throw new ConflictException('History can only be added to an imported conversation from the same platform');
      }
    } else {
      conversationId = newId();
      const participants = dto.participants ?? [];
      await store.insertImportedConversation({
        id: conversationId,
        kind: participants.length > 2 ? 'group' : 'direct',
        origin: 'imported',
        sourcePlatform: dto.platform,
        title: dto.title ?? (participants.filter(p => p !== dto.me).join(', ') || dto.fileName),
        createdByUserId: ownerUserId,
        retention: 'off',
        lastActivityAt: now,
        provenance: { importJobId: null, fileName: dto.fileName, importedAt: now, timezoneNote: dto.timezoneNote ?? '' },
        importedParticipants: participants,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }, ownerUserId);
    }

    const job: ImportJobRecord = {
      id: jobId, ownerUserId, conversationId, platform: dto.platform, fileName: dto.fileName, fileHash: dto.fileHash,
      status: 'ready', dateOrder: dto.dateOrder, me: dto.me ?? null, timezoneNote: dto.timezoneNote ?? null,
      total: dto.items.length, cursor: 0, imported: 0, skipped: 0, failed: 0, lastError: null,
      startedAt: null, completedAt: null, createdAt: now, updatedAt: now,
    };
    await store.insertJob(job);
    await store.linkConversationToJob(conversationId, jobId);
    await store.stageItems(dto.items.map((item, seq): ImportItemRecord => ({
      jobId, seq, sourceKey: item.sourceKey, sourceRef: item.ref,
      payload: item.message ? toPlanned(item.message) : null,
      parseError: item.error ?? null, outcome: null, reason: null, messageId: null, processedAt: null,
    })));
    return job;
  }

  /** Processes the next batch from the job's cursor in a single transaction. */
  async processBatch(jobId: string): Promise<ImportJobRecord> {
    return this.repo.transaction(async store => {
      const job = await store.getJob(jobId, { forUpdate: true });
      if (!job) throw new NotFoundException('Import not found');
      if (job.status === 'completed') return job;

      const now = nowIso();
      const items = await store.listItemsFrom(jobId, job.cursor, this.options.batchSize);
      const updates: ItemOutcomeUpdate[] = [];
      const candidates: { item: ImportItemRecord; message: MessageRecord }[] = [];
      const keysInBatch = new Set<string>();

      for (const item of items) {
        const built = this.buildMessage(job, item, now);
        if (typeof built === 'string') {
          updates.push({ seq: item.seq, outcome: 'failed', reason: built, messageId: null });
        } else if (keysInBatch.has(item.sourceKey)) {
          updates.push({ seq: item.seq, outcome: 'skipped', reason: ALREADY_IMPORTED, messageId: null });
        } else {
          keysInBatch.add(item.sourceKey);
          candidates.push({ item, message: built });
        }
      }

      const inserted = await store.insertMessagesIgnoringDuplicates(candidates.map(c => c.message));
      let latest: string | null = null;
      for (const { item, message } of candidates) {
        if (inserted.has(item.sourceKey)) {
          updates.push({ seq: item.seq, outcome: 'imported', reason: null, messageId: message.id });
          if (!latest || message.sentAt > latest) latest = message.sentAt;
        } else {
          updates.push({ seq: item.seq, outcome: 'skipped', reason: ALREADY_IMPORTED, messageId: null });
        }
      }
      updates.sort((a, b) => a.seq - b.seq);
      await store.recordOutcomes(jobId, updates, now);
      if (latest) await store.touchConversation(job.conversationId, latest);

      const cursor = job.cursor + items.length;
      const done = cursor >= job.total;
      const next: ImportJobRecord = {
        ...job,
        cursor,
        imported: job.imported + updates.filter(u => u.outcome === 'imported').length,
        skipped: job.skipped + updates.filter(u => u.outcome === 'skipped').length,
        failed: job.failed + updates.filter(u => u.outcome === 'failed').length,
        status: done ? 'completed' : 'importing',
        startedAt: job.startedAt ?? now,
        completedAt: done ? now : null,
        lastError: null,
        updatedAt: now,
      };
      await store.updateJob(next);
      return next;
    });
  }

  /**
   * Runs batches until the job completes or `maxBatches` is reached (then it is paused).
   * Unexpected errors mark the job failed with the error; the last committed batch stays.
   */
  async run(jobId: string, maxBatches = this.options.maxBatchesPerRun): Promise<ImportJobRecord> {
    if (this.running.has(jobId)) throw new ConflictException('This import is already running');
    this.running.add(jobId);
    try {
      let job = await this.setStatus(jobId, 'importing');
      for (let i = 0; i < maxBatches && job.status !== 'completed'; i++) {
        job = await this.processBatch(jobId);
      }
      if (job.status === 'completed') {
        await this.audit.record({
          userId: job.ownerUserId, action: 'import.completed', targetType: 'import_job', targetId: job.id,
          detail: `${job.imported} imported, ${job.skipped} skipped, ${job.failed} failed`,
        });
        return job;
      }
      return await this.setStatus(jobId, 'paused');
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ msg: 'import batch failed', jobId, err: message });
      return this.setStatus(jobId, 'failed', message);
    } finally {
      this.running.delete(jobId);
    }
  }

  /** Continues an interrupted, paused or failed job from its cursor. Completed jobs are returned as-is. */
  async resume(ownerUserId: string, jobId: string): Promise<ImportJobRecord> {
    const job = await this.getOwned(ownerUserId, jobId);
    if (job.status === 'completed') return job;
    await this.audit.record({ userId: ownerUserId, action: 'import.resumed', targetType: 'import_job', targetId: jobId, detail: `from ${job.cursor}/${job.total}` });
    return this.run(jobId);
  }

  async getOwned(ownerUserId: string, jobId: string): Promise<ImportJobRecord> {
    const job = await this.repo.getJob(jobId);
    // 404 rather than 403 so other users' job ids can't be probed.
    if (!job || job.ownerUserId !== ownerUserId) throw new NotFoundException('Import not found');
    return job;
  }

  async view(ownerUserId: string, jobId: string) {
    const job = await this.getOwned(ownerUserId, jobId);
    return jobView(job, await this.repo.listProblemItems(jobId, MAX_REPORT_ITEMS));
  }

  /** Machine-readable report, same format as migrationReport() in the client. */
  async report(ownerUserId: string, jobId: string) {
    const job = await this.getOwned(ownerUserId, jobId);
    const problems = await this.repo.listProblemItems(jobId, MAX_REPORT_ITEMS);
    return {
      format: 'hye-migration-report/1',
      jobId: job.id,
      source: job.platform,
      file: job.fileName,
      startedAt: job.createdAt,
      completedAt: job.completedAt,
      status: job.status,
      dateOrder: job.dateOrder,
      totals: { records: job.total, imported: job.imported, skipped: job.skipped, failed: job.failed },
      items: jobView(job, problems).results,
      itemsTruncated: job.skipped + job.failed > problems.length,
    };
  }

  private async setStatus(jobId: string, status: ImportJobRecord['status'], lastError: string | null = null) {
    return this.repo.transaction(async store => {
      const job = await store.getJob(jobId, { forUpdate: true });
      if (!job) throw new NotFoundException('Import not found');
      if (job.status === 'completed') return job;
      const next = { ...job, status, lastError, updatedAt: nowIso() };
      await store.updateJob(next);
      return next;
    });
  }

  /** Returns the message to insert, or the reason this item fails. */
  private buildMessage(job: ImportJobRecord, item: ImportItemRecord, now: string): MessageRecord | string {
    if (item.parseError) return item.parseError;
    const p = item.payload;
    if (!p) return 'No message data for this record';
    const sentAt = normalizeTimestamp(p.sentAt);
    if (!sentAt) return `Unreadable timestamp "${p.sentAt}"`;
    if (p.text.length > MAX_TEXT) return `Message is longer than ${MAX_TEXT} characters`;
    const deletedAt = p.deletedAt ? normalizeTimestamp(p.deletedAt) ?? sentAt : null;
    return {
      id: newId(),
      conversationId: job.conversationId,
      ownerUserId: job.ownerUserId,
      senderUserId: p.isMe ? job.ownerUserId : null,
      senderName: p.senderName || 'Unknown',
      clientMessageId: null,
      body: deletedAt ? '' : p.text,
      system: !!p.system,
      sentAt,
      editedAt: p.editedAt ? normalizeTimestamp(p.editedAt) ?? sentAt : null,
      deletedAt,
      replyToId: null,
      forwardedFrom: null,
      status: null,
      origin: 'imported',
      sourcePlatform: job.platform,
      sourceKey: item.sourceKey,
      sourceRef: item.sourceRef,
      importJobId: job.id,
      // Files from the export are not uploaded yet: keep the record of them with a reason.
      attachments: (p.attachments ?? []).map(a => ({
        id: newId(), kind: a.kind, fileName: a.fileName, storageKey: null,
        missingReason: a.missingReason ?? 'File not uploaded to hye yet',
      })),
      createdAt: now,
      updatedAt: now,
    };
  }
}

function toPlanned(m: CreateImportDto['items'][number]['message'] & object): PlannedMessage {
  return {
    senderName: m.senderName, isMe: !!m.isMe, text: m.text, sentAt: m.sentAt, editedAt: m.editedAt ?? null,
    deletedAt: m.deletedAt ?? null, system: !!m.system,
    attachments: m.attachments?.map(a => ({ kind: a.kind, fileName: a.fileName, missingReason: a.missingReason ?? null })),
  };
}
