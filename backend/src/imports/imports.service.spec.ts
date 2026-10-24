import 'reflect-metadata';
import { ConsoleLogger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { AUDIT_REPOSITORY, InMemoryAuditRepository } from '../audit/audit.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { MessageRecord } from '../persistence/records.js';
import type { CreateImportDto, ImportItemDto } from './dto/create-import.dto.js';
import { IMPORTS_REPOSITORY } from './imports.repository.js';
import { IMPORTS_OPTIONS, ImportsService, normalizeTimestamp } from './imports.service.js';
import { InMemoryImportsRepository } from './in-memory-imports.repository.js';

const OWNER = '6f1c1d4e-8a7b-4c4e-9a59-0b3b0f2a1c11';
const hashOf = (s: string) => createHash('sha256').update(s).digest('hex');

function items(n: number, from = 0): ImportItemDto[] {
  return Array.from({ length: n }, (_, k) => {
    const i = from + k;
    return {
      ref: `line ${i + 1}`,
      sourceKey: `key-${i}`,
      message: {
        senderName: i % 2 ? 'Asha' : 'Me',
        isMe: i % 2 === 0,
        text: `message ${i}`,
        sentAt: new Date(Date.UTC(2024, 0, 1, 9, i)).toISOString(),
      },
    };
  });
}

function dto(list: ImportItemDto[], file = 'chat.txt'): CreateImportDto {
  return {
    platform: 'whatsapp', fileName: file, fileHash: hashOf(file + list.length), dateOrder: 'DMY', me: 'Me',
    participants: ['Me', 'Asha'], items: list,
  };
}

/** Fails the Nth call to insertMessagesIgnoringDuplicates, like a DB error mid-import. */
class FlakyRepository extends InMemoryImportsRepository {
  calls = 0;
  failOnCall: number | null = null;
  override async insertMessagesIgnoringDuplicates(messages: MessageRecord[]) {
    this.calls++;
    if (this.calls === this.failOnCall) throw new Error('connection reset');
    return super.insertMessagesIgnoringDuplicates(messages);
  }
}

describe('ImportsService', () => {
  let db: InMemoryDb;
  let repo: FlakyRepository;
  let service: ImportsService;

  beforeEach(async () => {
    db = new InMemoryDb();
    repo = new FlakyRepository(db);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportsService,
        AuditService,
        { provide: IMPORTS_REPOSITORY, useValue: repo },
        { provide: IMPORTS_OPTIONS, useValue: { batchSize: 4, maxBatchesPerRun: 100 } },
        { provide: AUDIT_REPOSITORY, useValue: new InMemoryAuditRepository(db) },
      ],
    })
      .setLogger(new ConsoleLogger({ logLevels: [] }))
      .compile();
    service = moduleRef.get(ImportsService);
  });

  describe('idempotency', () => {
    it('returns the existing job for the same file and imports nothing twice', async () => {
      const input = dto(items(10));
      const first = await service.create(OWNER, input);
      expect(first.created).toBe(true);
      const done = await service.run(first.job.id);
      expect(done).toMatchObject({ status: 'completed', total: 10, cursor: 10, imported: 10, skipped: 0, failed: 0 });
      expect(repo.countImportedMessages(OWNER)).toBe(10);

      const again = await service.create(OWNER, input);
      expect(again.created).toBe(false);
      expect(again.job.id).toBe(first.job.id);
      await service.resume(OWNER, again.job.id);
      expect(repo.countImportedMessages(OWNER)).toBe(10);
      expect(db.importJobs.size).toBe(1);
      expect(db.conversations.size).toBe(1);
    });

    it('re-running the same items under a new job skips every one of them', async () => {
      const first = await service.create(OWNER, dto(items(10), 'a.txt'));
      await service.run(first.job.id);

      // Same records, different file (e.g. exported again), into the same conversation.
      const second = await service.create(OWNER, { ...dto(items(10), 'b.txt'), conversationId: first.job.conversationId });
      const job = await service.run(second.job.id);
      expect(job).toMatchObject({ status: 'completed', imported: 0, skipped: 10, failed: 0 });
      expect(repo.countImportedMessages(OWNER)).toBe(10);

      const view = await service.view(OWNER, second.job.id);
      expect(view.results).toHaveLength(10);
      expect(view.results.every(r => r.outcome === 'skipped' && r.reason === 'Already imported')).toBe(true);
    });

    it('imports only the new tail of a longer re-export', async () => {
      const first = await service.create(OWNER, dto(items(6), 'a.txt'));
      await service.run(first.job.id);
      const second = await service.create(OWNER, { ...dto(items(9), 'b.txt'), conversationId: first.job.conversationId });
      const job = await service.run(second.job.id);
      expect(job).toMatchObject({ imported: 3, skipped: 6 });
      expect(repo.countImportedMessages(OWNER)).toBe(9);
    });

    it('treats a repeated source key inside one import as already imported', async () => {
      const list = items(3);
      list.push({ ...list[1], ref: 'line 99' });
      const { job } = await service.create(OWNER, dto(list));
      const done = await service.run(job.id);
      expect(done).toMatchObject({ imported: 3, skipped: 1 });
    });
  });

  describe('resumability', () => {
    it('stops after the batch budget, then resumes from the saved cursor', async () => {
      const { job } = await service.create(OWNER, dto(items(10)));
      const paused = await service.run(job.id, 1);
      expect(paused).toMatchObject({ status: 'paused', cursor: 4, imported: 4 });
      expect(repo.countImportedMessages(OWNER)).toBe(4);

      const resumed = await service.resume(OWNER, job.id);
      expect(resumed).toMatchObject({ status: 'completed', cursor: 10, imported: 10, skipped: 0 });
      expect(repo.countImportedMessages(OWNER)).toBe(10);
    });

    it('rolls back a failed batch and finishes on resume without duplicates', async () => {
      const { job } = await service.create(OWNER, dto(items(10)));
      repo.failOnCall = 2; // second batch blows up mid-transaction

      const failed = await service.run(job.id);
      expect(failed).toMatchObject({ status: 'failed', cursor: 4, imported: 4, lastError: 'connection reset' });
      expect(repo.countImportedMessages(OWNER)).toBe(4); // batch 2 left nothing behind
      const pending = (await repo.listItemsFrom(job.id, 4, 100)).filter(i => i.outcome !== null);
      expect(pending).toHaveLength(0);

      const resumed = await service.resume(OWNER, job.id);
      expect(resumed).toMatchObject({ status: 'completed', cursor: 10, imported: 10, skipped: 0, failed: 0, lastError: null });
      expect(repo.countImportedMessages(OWNER)).toBe(10);
    });

    it('is safe to resume a completed job', async () => {
      const { job } = await service.create(OWNER, dto(items(5)));
      await service.run(job.id);
      const again = await service.resume(OWNER, job.id);
      expect(again).toMatchObject({ status: 'completed', imported: 5 });
      expect(repo.countImportedMessages(OWNER)).toBe(5);
    });
  });

  describe('failure recording', () => {
    it('records failed items with reasons and keeps importing the rest', async () => {
      const list = items(6);
      list[1] = { ref: 'lines 2-3', sourceKey: 'bad-date', error: 'Unreadable date 31/02/24 for the chosen date order' };
      list[3] = { ...list[3], message: { ...list[3].message!, sentAt: 'not a date' } };
      list[4] = { ref: 'line 5', sourceKey: 'empty' };

      const { job } = await service.create(OWNER, dto(list));
      const done = await service.run(job.id);
      expect(done).toMatchObject({ status: 'completed', total: 6, imported: 3, skipped: 0, failed: 3 });

      const report = await service.report(OWNER, job.id);
      expect(report.format).toBe('hye-migration-report/1');
      expect(report.totals).toEqual({ records: 6, imported: 3, skipped: 0, failed: 3 });
      expect(report.items).toEqual([
        { ref: 'lines 2-3', outcome: 'failed', reason: 'Unreadable date 31/02/24 for the chosen date order' },
        { ref: 'line 4', outcome: 'failed', reason: 'Unreadable timestamp "not a date"' },
        { ref: 'line 5', outcome: 'failed', reason: 'No message data for this record' },
      ]);
    });

    it('hides other users’ jobs', async () => {
      const { job } = await service.create(OWNER, dto(items(1)));
      await expect(service.view('0b0b0b0b-0000-4000-8000-000000000000', job.id)).rejects.toThrow('Import not found');
    });
  });

  describe('provenance', () => {
    it('stores imported messages as read-only history with source keys and refs', async () => {
      const { job } = await service.create(OWNER, { ...dto(items(2)), timezoneNote: 'Phone local time' });
      await service.run(job.id);
      const conversation = db.conversations.get(job.conversationId)!;
      expect(conversation).toMatchObject({ origin: 'imported', sourcePlatform: 'whatsapp' });
      expect(conversation.provenance).toMatchObject({ importJobId: job.id, fileName: 'chat.txt', timezoneNote: 'Phone local time' });
      const messages = [...db.messages.values()];
      expect(messages[0]).toMatchObject({ origin: 'imported', sourceKey: 'key-0', sourceRef: 'line 1', senderUserId: OWNER, importJobId: job.id });
      expect(messages[1].senderUserId).toBeNull();
    });

    it('keeps offset-less export times as wall-clock UTC', () => {
      expect(normalizeTimestamp('2024-03-01T10:15:00')).toBe('2024-03-01T10:15:00.000Z');
      expect(normalizeTimestamp('2024-03-01T10:15:00+02:00')).toBe('2024-03-01T08:15:00.000Z');
      expect(normalizeTimestamp('garbage')).toBeNull();
    });
  });
});
