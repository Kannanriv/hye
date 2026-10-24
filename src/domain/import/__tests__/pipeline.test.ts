import type { ImportJob } from '../../types';
import { planImport, previewImport, runImportBatch } from '../pipeline';
import { parseWhatsAppExport } from '../whatsapp';

const EXPORT = [
  '24/10/2026, 09:16 - Priya: Hi',
  '24/10/2026, 09:16 - Priya: Hi', // a genuine repeat, must not be collapsed
  '24/10/2026, 09:17 - Kannan: IMG-1.jpg (file attached)',
  '24/10/2026, 09:18 - Kannan: VID-2.mp4 (file attached)',
  '31/02/2026, 09:19 - Priya: impossible date',
].join('\n');

function job(total: number): ImportJob {
  return {
    id: 'job1', platform: 'whatsapp', fileName: 'WhatsApp Chat with Priya.zip', conversationId: 'c1',
    status: 'importing', createdAt: '2026-10-24T00:00:00Z', total, cursor: 0,
    imported: 0, skipped: 0, failed: 0, results: [], dateOrder: 'DMY', me: 'Kannan',
  };
}

describe('import pipeline', () => {
  const parsed = parseWhatsAppExport(EXPORT);
  const plan = planImport(parsed, 'DMY', 'priya', [{ name: 'IMG-1.jpg', uri: 'file:///img1.jpg' }], 'Kannan');

  it('gives repeated identical messages distinct keys', () => {
    expect(plan[0].sourceKey).not.toBe(plan[1].sourceKey);
  });

  it('produces the same keys every time (deterministic)', () => {
    const again = planImport(parsed, 'DMY', 'priya', null, 'Kannan');
    expect(again.map(p => p.sourceKey)).toEqual(plan.map(p => p.sourceKey));
  });

  it('marks the user’s own messages and links archive files', () => {
    expect(plan[2].message!.senderId).toBe('me');
    expect(plan[2].message!.attachments[0].uri).toBe('file:///img1.jpg');
    expect(plan[3].message!.attachments[0].missingReason).toBe('File not found in the archive');
  });

  it('turns bad records into failures with a reason, without inventing a date', () => {
    expect(plan[4].error).toMatch(/Unreadable date/);
    expect(plan[4].message).toBeUndefined();
  });

  it('previews counts and duplicates before anything is written', () => {
    const preview = previewImport(parsed, plan, new Set([plan[0].sourceKey]));
    expect(preview.messages).toBe(4);
    expect(preview.duplicates).toBe(1);
    expect(preview.invalid).toBe(1);
    expect(preview.attachmentsIncluded).toBe(1);
    expect(preview.attachmentsMissingFromArchive).toBe(1);
    expect(preview.firstAt).toBe('2026-10-24T09:16:00');
  });

  it('resumes from the cursor and is idempotent across reruns', () => {
    const keys = new Set<string>();
    const first = runImportBatch(job(plan.length), plan, keys, 2);
    expect(first.job.cursor).toBe(2);
    expect(first.job.status).toBe('importing');
    expect(first.newMessages).toHaveLength(2);

    const second = runImportBatch(first.job, plan, keys, 10);
    expect(second.job.status).toBe('completed');
    expect(second.job.imported).toBe(4);
    expect(second.job.failed).toBe(1);

    // Importing the same export again adds nothing.
    const rerun = runImportBatch(job(plan.length), plan, keys, 10);
    expect(rerun.newMessages).toHaveLength(0);
    expect(rerun.job.skipped).toBe(4);
    expect(rerun.job.failed).toBe(1);
  });
});
