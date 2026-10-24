// Pins the numbers the web e2e suite (e2e/web/test_journeys.py) asserts for its fixture files.
import { readFileSync } from 'fs';
import { join } from 'path';

import { planImport, previewImport } from '../pipeline';
import { parseWhatsAppExport } from '../whatsapp';

const fixture = (name: string) => readFileSync(join(__dirname, '../../../../e2e/fixtures', name), 'utf8');

describe('e2e fixture: WhatsApp Chat with Priya.txt', () => {
  const parsed = parseWhatsAppExport(fixture('WhatsApp Chat with Priya.txt'));
  const plan = planImport(parsed, 'DMY', 'k', null, 'Kannan');
  const preview = previewImport(parsed, plan, new Set());

  it('is unambiguously day-first with two participants', () => {
    expect(parsed.possibleDateOrders).toEqual(['DMY']);
    expect(parsed.participants).toEqual(['Priya', 'Kannan']);
    expect(parsed.orphanLines).toEqual([]);
  });

  it('has the expected mix of records', () => {
    expect(parsed.records).toHaveLength(25);
    expect(preview).toMatchObject({
      messages: 22, systemNotices: 2, deletedPlaceholders: 1, edited: 1,
      attachmentsIncluded: 0, attachmentsMissingFromArchive: 2, attachmentsOmittedByExport: 1, invalid: 0, duplicates: 0,
    });
  });

  it('keeps multi-line messages and attachment captions together', () => {
    const plan4 = parsed.records.find(r => r.text.startsWith("Here's the plan"))!;
    expect(plan4.text.split('\n')).toHaveLength(4);
    const img = parsed.records.find(r => r.attachments[0]?.fileName === 'IMG-20250914-WA0007.jpg')!;
    expect(img.text).toBe('The hostel I was talking about');
  });
});

describe('e2e fixture: ambiguous.txt', () => {
  it('cannot tell DMY from MDY', () => {
    const parsed = parseWhatsAppExport(fixture('ambiguous.txt'));
    expect(parsed.possibleDateOrders).toEqual(['DMY', 'MDY']);
    expect(parsed.records).toHaveLength(5);
  });
});
