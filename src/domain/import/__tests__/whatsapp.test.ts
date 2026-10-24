import { parseWhatsAppExport, recordTimestamp, titleFromFileName } from '../whatsapp';

const ANDROID = [
  '24/10/2026, 09:15 - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
  '24/10/2026, 09:16 - Priya: Morning! Are we still on for Saturday?',
  '24/10/2026, 09:17 - Kannan: Yes',
  'Bringing the cake too',
  '24/10/2026, 09:18 - Priya: IMG-20261024-WA0003.jpg (file attached)',
  'Look at this',
  '24/10/2026, 09:19 - Priya: <Media omitted>',
  '24/10/2026, 09:20 - Kannan: This message was deleted',
  '25/10/2026, 21:02 - Priya: Fixed the time <This message was edited>',
].join('\n');

const IOS = [
  '‎[10/24/26, 2:05:33 PM] Sam Lee: Hey there',
  '[10/24/26, 2:06:01 PM] Kannan: ‎<attached: 00000012-PHOTO-2026-10-24-14-06-01.jpg>',
  '[10/24/26, 12:01:00 AM] Sam Lee: ‎image omitted',
].join('\n');

describe('parseWhatsAppExport (Android)', () => {
  const parsed = parseWhatsAppExport(ANDROID);

  it('reads every record and joins continuation lines', () => {
    expect(parsed.records).toHaveLength(7);
    expect(parsed.records[2].text).toBe('Yes\nBringing the cake too');
    expect(parsed.records[2].lineEnd).toBe(4);
  });

  it('separates system notices from messages', () => {
    expect(parsed.records[0].kind).toBe('system');
    expect(parsed.records[0].sender).toBeNull();
    expect(parsed.participants).toEqual(['Priya', 'Kannan']);
  });

  it('extracts attachments, captions, omitted media, deletions and edits', () => {
    expect(parsed.records[3].attachments).toEqual([{ fileName: 'IMG-20261024-WA0003.jpg', included: true }]);
    expect(parsed.records[3].text).toBe('Look at this');
    expect(parsed.records[4].attachments[0].included).toBe(false);
    expect(parsed.records[5].kind).toBe('deleted');
    expect(parsed.records[6].edited).toBe(true);
    expect(parsed.records[6].text).toBe('Fixed the time');
  });

  it('detects day-first dates when a day is above 12', () => {
    expect(parsed.possibleDateOrders).toEqual(['DMY']);
    expect(recordTimestamp(parsed.records[1], 'DMY')).toBe('2026-10-24T09:16:00');
  });
});

describe('parseWhatsAppExport (iOS)', () => {
  const parsed = parseWhatsAppExport(IOS);

  it('handles brackets, seconds, 12-hour clock and invisible characters', () => {
    expect(parsed.records).toHaveLength(3);
    expect(parsed.hasSeconds).toBe(true);
    expect(parsed.possibleDateOrders).toEqual(['MDY']);
    expect(recordTimestamp(parsed.records[0], 'MDY')).toBe('2026-10-24T14:05:33');
    expect(recordTimestamp(parsed.records[2], 'MDY')).toBe('2026-10-24T00:01:00');
  });

  it('reads iOS attachment markers', () => {
    expect(parsed.records[1].attachments[0].fileName).toBe('00000012-PHOTO-2026-10-24-14-06-01.jpg');
    expect(parsed.records[2].attachments[0].included).toBe(false);
  });
});

describe('ambiguity and bad input', () => {
  it('reports both orders when the file cannot tell them apart', () => {
    const p = parseWhatsAppExport('03/04/2026, 10:00 - A: hi\n05/06/2026, 10:01 - B: hello');
    expect(p.possibleDateOrders).toEqual(['DMY', 'MDY']);
  });

  it('keeps lines before the first message as orphans instead of guessing', () => {
    const p = parseWhatsAppExport('garbage header\n03/04/2026, 10:00 - A: hi');
    expect(p.orphanLines).toEqual([1]);
    expect(p.records).toHaveLength(1);
  });

  it('rejects impossible dates', () => {
    const p = parseWhatsAppExport('31/02/2026, 10:00 - A: hi');
    expect(recordTimestamp(p.records[0], 'DMY')).toBeNull();
  });

  it('returns nothing for a file that is not a WhatsApp export', () => {
    const p = parseWhatsAppExport('name,email\nfoo,bar@example.com');
    expect(p.records).toHaveLength(0);
    expect(p.possibleDateOrders).toEqual([]);
  });
});

describe('titleFromFileName', () => {
  it('uses the WhatsApp file name when present', () => {
    expect(titleFromFileName('WhatsApp Chat with Priya.txt', [])).toBe('Priya');
    expect(titleFromFileName('WhatsApp Chat - Family Group.zip', [])).toBe('Family Group');
  });
  it('falls back to participants other than the user', () => {
    expect(titleFromFileName('_chat.txt', ['Kannan', 'Sam'], 'Kannan')).toBe('Sam');
  });
});
