import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import type { SourcePlatform } from '../common/domain.js';
import { PG_POOL } from '../persistence/persistence.module.js';
import type { ConversationRecord, ImportItemRecord, ImportJobRecord, MessageRecord, PlannedMessage } from '../persistence/records.js';
import { DuplicateImportError, type ImportsRepository, type ImportsStore, type ItemOutcomeUpdate } from './imports.repository.js';

type Query = (text: string, values?: unknown[]) => Promise<pg.QueryResult>;

const STAGE_CHUNK = 2_000;
const iso = (v: Date | string | null | undefined): string | null => (v == null ? null : new Date(v).toISOString());

/** "line 12" / "lines 12-14" → [12, 14] */
export function parseLineRef(ref: string): [number | null, number | null] {
  const m = /lines?\s+(\d+)(?:\s*-\s*(\d+))?/i.exec(ref);
  if (!m) return [null, null];
  const start = Number(m[1]);
  return [start, m[2] ? Number(m[2]) : start];
}

function jobFromRow(r: Record<string, any>): ImportJobRecord {
  return {
    id: r.id, ownerUserId: r.owner_user_id, conversationId: r.conversation_id, platform: r.source_platform,
    fileName: r.file_name, fileHash: r.source_file_hash, status: r.status, dateOrder: r.date_order,
    me: r.me_participant, timezoneNote: r.timezone_note, total: r.total, cursor: r.cursor,
    imported: r.imported, skipped: r.skipped, failed: r.failed, lastError: r.last_error,
    startedAt: iso(r.started_at), completedAt: iso(r.completed_at), createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
  };
}

function itemFromRow(r: Record<string, any>): ImportItemRecord {
  return {
    jobId: r.job_id, seq: r.seq, sourceKey: r.source_key, sourceRef: r.source_ref,
    payload: (r.payload as PlannedMessage | null) ?? null, parseError: r.parse_error, outcome: r.outcome,
    reason: r.reason, messageId: r.message_id, processedAt: iso(r.processed_at),
  };
}

function conversationFromRow(r: Record<string, any>): ConversationRecord {
  return {
    id: r.id, kind: r.kind, origin: r.origin, sourcePlatform: r.source_platform, title: r.title,
    createdByUserId: r.created_by_user_id, retention: r.retention, lastActivityAt: iso(r.last_activity_at)!,
    provenance: r.provenance_imported_at
      ? { importJobId: r.provenance_import_job_id, fileName: r.provenance_file_name ?? '', importedAt: iso(r.provenance_imported_at)!, timezoneNote: r.provenance_timezone_note ?? '' }
      : null,
    importedParticipants: r.imported_participants ?? [], createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
    deletedAt: iso(r.deleted_at),
  };
}

/** ImportsStore over a single connection or the pool. */
export class PgImportsStore implements ImportsStore {
  constructor(protected readonly query: Query) {}

  async findJobByFileHash(ownerUserId: string, platform: SourcePlatform, fileHash: string) {
    const { rows } = await this.query(
      'SELECT * FROM import_jobs WHERE owner_user_id = $1 AND source_platform = $2 AND source_file_hash = $3',
      [ownerUserId, platform, fileHash],
    );
    return rows[0] ? jobFromRow(rows[0]) : null;
  }

  async getJob(jobId: string, opts: { forUpdate?: boolean } = {}) {
    const { rows } = await this.query(`SELECT * FROM import_jobs WHERE id = $1${opts.forUpdate ? ' FOR UPDATE' : ''}`, [jobId]);
    return rows[0] ? jobFromRow(rows[0]) : null;
  }

  async insertJob(j: ImportJobRecord) {
    try {
      await this.query(
        `INSERT INTO import_jobs (id, owner_user_id, conversation_id, source_platform, file_name, source_file_hash,
           status, date_order, me_participant, timezone_note, total, cursor, imported, skipped, failed,
           last_error, started_at, completed_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [j.id, j.ownerUserId, j.conversationId, j.platform, j.fileName, j.fileHash, j.status, j.dateOrder, j.me,
          j.timezoneNote, j.total, j.cursor, j.imported, j.skipped, j.failed, j.lastError, j.startedAt, j.completedAt,
          j.createdAt, j.updatedAt],
      );
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505' && e.constraint === 'import_jobs_file_uniq') throw new DuplicateImportError();
      throw err;
    }
  }

  async updateJob(j: ImportJobRecord) {
    const { rowCount } = await this.query(
      `UPDATE import_jobs SET status = $2, cursor = $3, imported = $4, skipped = $5, failed = $6,
         last_error = $7, started_at = $8, completed_at = $9
       WHERE id = $1`,
      [j.id, j.status, j.cursor, j.imported, j.skipped, j.failed, j.lastError, j.startedAt, j.completedAt],
    );
    if (rowCount !== 1) throw new Error(`import job ${j.id} not found`);
  }

  async getConversation(conversationId: string) {
    const { rows } = await this.query('SELECT * FROM conversations WHERE id = $1 AND deleted_at IS NULL', [conversationId]);
    return rows[0] ? conversationFromRow(rows[0]) : null;
  }

  async isConversationMember(conversationId: string, userId: string) {
    const { rowCount } = await this.query(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
      [conversationId, userId],
    );
    return rowCount === 1;
  }

  async insertImportedConversation(c: ConversationRecord, ownerUserId: string) {
    await this.query(
      `INSERT INTO conversations (id, kind, origin, source_platform, title, created_by_user_id, retention,
         last_activity_at, provenance_import_job_id, provenance_file_name, provenance_imported_at,
         provenance_timezone_note, imported_participants, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [c.id, c.kind, c.origin, c.sourcePlatform, c.title, c.createdByUserId, c.retention, c.lastActivityAt,
        c.provenance?.importJobId ?? null, c.provenance?.fileName ?? null, c.provenance?.importedAt ?? null,
        c.provenance?.timezoneNote ?? null, c.importedParticipants, c.createdAt, c.updatedAt],
    );
    await this.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role, last_read_at, last_activity_at, joined_at)
       VALUES ($1, $2, 'admin', $3, $4, $3)`,
      [c.id, ownerUserId, c.createdAt, c.lastActivityAt],
    );
  }

  async linkConversationToJob(conversationId: string, jobId: string) {
    await this.query(
      'UPDATE conversations SET provenance_import_job_id = $2 WHERE id = $1 AND provenance_import_job_id IS NULL',
      [conversationId, jobId],
    );
  }

  async touchConversation(conversationId: string, at: string) {
    await this.query('UPDATE conversations SET last_activity_at = GREATEST(last_activity_at, $2) WHERE id = $1', [conversationId, at]);
    await this.query(
      'UPDATE conversation_members SET last_activity_at = GREATEST(last_activity_at, $2) WHERE conversation_id = $1',
      [conversationId, at],
    );
  }

  async stageItems(items: ImportItemRecord[]) {
    for (let i = 0; i < items.length; i += STAGE_CHUNK) {
      const chunk = items.slice(i, i + STAGE_CHUNK);
      const rows = chunk.map(it => {
        const [lineStart, lineEnd] = parseLineRef(it.sourceRef);
        return {
          job_id: it.jobId, seq: it.seq, source_key: it.sourceKey, source_ref: it.sourceRef,
          line_start: lineStart, line_end: lineEnd, payload: it.payload, parse_error: it.parseError,
        };
      });
      await this.query(
        `INSERT INTO import_items (job_id, seq, source_key, source_ref, line_start, line_end, payload, parse_error)
         SELECT x.job_id, x.seq, x.source_key, x.source_ref, x.line_start, x.line_end, x.payload, x.parse_error
         FROM jsonb_to_recordset($1::jsonb) AS x(job_id uuid, seq int, source_key text, source_ref text,
           line_start int, line_end int, payload jsonb, parse_error text)`,
        [JSON.stringify(rows)],
      );
    }
  }

  async listItemsFrom(jobId: string, fromSeq: number, limit: number) {
    const { rows } = await this.query(
      'SELECT * FROM import_items WHERE job_id = $1 AND seq >= $2 ORDER BY seq LIMIT $3',
      [jobId, fromSeq, limit],
    );
    return rows.map(itemFromRow);
  }

  async recordOutcomes(jobId: string, updates: ItemOutcomeUpdate[], processedAt: string) {
    if (!updates.length) return;
    await this.query(
      `UPDATE import_items AS i
         SET outcome = x.outcome::import_outcome, reason = x.reason, message_id = x.message_id, processed_at = $3
       FROM jsonb_to_recordset($2::jsonb) AS x(seq int, outcome text, reason text, message_id uuid)
       WHERE i.job_id = $1 AND i.seq = x.seq`,
      [jobId, JSON.stringify(updates.map(u => ({ seq: u.seq, outcome: u.outcome, reason: u.reason, message_id: u.messageId }))), processedAt],
    );
  }

  async listProblemItems(jobId: string, limit: number) {
    const { rows } = await this.query(
      `SELECT * FROM import_items WHERE job_id = $1 AND outcome IN ('skipped', 'failed') ORDER BY seq LIMIT $2`,
      [jobId, limit],
    );
    return rows.map(itemFromRow);
  }

  async insertMessagesIgnoringDuplicates(messages: MessageRecord[]) {
    const inserted = new Set<string>();
    if (!messages.length) return inserted;
    const rows = messages.map(m => ({
      id: m.id, conversation_id: m.conversationId, owner_user_id: m.ownerUserId, sender_user_id: m.senderUserId,
      sender_name: m.senderName, body: m.body, is_system: m.system, sent_at: m.sentAt, edited_at: m.editedAt,
      deleted_at: m.deletedAt, origin: m.origin, source_platform: m.sourcePlatform, source_key: m.sourceKey,
      source_ref: m.sourceRef, import_job_id: m.importJobId, created_at: m.createdAt,
    }));
    const { rows: returned } = await this.query(
      `INSERT INTO messages (id, conversation_id, owner_user_id, sender_user_id, sender_name, body, is_system,
         sent_at, edited_at, deleted_at, origin, source_platform, source_key, source_ref, import_job_id, created_at, updated_at)
       SELECT x.id, x.conversation_id, x.owner_user_id, x.sender_user_id, x.sender_name, x.body, x.is_system,
         x.sent_at, x.edited_at, x.deleted_at, x.origin::conversation_origin, x.source_platform::source_platform,
         x.source_key, x.source_ref, x.import_job_id, x.created_at, x.created_at
       FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, conversation_id uuid, owner_user_id uuid, sender_user_id uuid,
         sender_name text, body text, is_system boolean, sent_at timestamptz, edited_at timestamptz,
         deleted_at timestamptz, origin text, source_platform text, source_key text, source_ref text,
         import_job_id uuid, created_at timestamptz)
       ON CONFLICT ON CONSTRAINT messages_source_key_uniq DO NOTHING
       RETURNING id, source_key`,
      [JSON.stringify(rows)],
    );
    const insertedIds = new Set<string>();
    for (const r of returned) {
      inserted.add(r.source_key);
      insertedIds.add(r.id);
    }
    const attachments = messages
      .filter(m => insertedIds.has(m.id))
      .flatMap(m => m.attachments.map(a => ({
        id: a.id, message_id: m.id, kind: a.kind, file_name: a.fileName, storage_key: a.storageKey,
        missing_reason: a.missingReason, scan_status: a.storageKey ? 'pending' : 'skipped',
      })));
    if (attachments.length) {
      await this.query(
        `INSERT INTO message_attachments (id, message_id, kind, file_name, storage_key, missing_reason, scan_status)
         SELECT x.id, x.message_id, x.kind::attachment_kind, x.file_name, x.storage_key, x.missing_reason,
           x.scan_status::malware_scan_status
         FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, message_id uuid, kind text, file_name text,
           storage_key text, missing_reason text, scan_status text)`,
        [JSON.stringify(attachments)],
      );
    }
    return inserted;
  }
}

/** Postgres ImportsRepository. Each transaction() runs on one pooled connection. */
@Injectable()
export class PgImportsRepository extends PgImportsStore implements ImportsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {
    super((text, values) => pool.query(text, values));
  }

  async transaction<T>(fn: (store: ImportsStore) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new PgImportsStore((text, values) => client.query(text, values)));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
