// Parser for WhatsApp's user-initiated "Export chat" text format (Android and iOS).
// This is the only import format hye supports in the MVP. The export is created by the
// user inside WhatsApp; hye never connects to WhatsApp or reads its encrypted storage.
//
// What the format does NOT contain, so we never invent it:
//   - time zones (timestamps are the exporting phone's wall-clock time)
//   - reactions, reply/quote relationships, read receipts, phone numbers for named contacts
//   - media files when the user chose "Without media"

export type DateOrder = 'DMY' | 'MDY' | 'YMD';

export interface ParsedAttachment {
  fileName: string;
  /** false when the export says the media was omitted */
  included: boolean;
}

export interface ParsedRecord {
  /** 1-based first/last line in the export, kept for provenance and failure reports. */
  lineStart: number;
  lineEnd: number;
  date: [number, number, number];
  time: { h: number; m: number; s: number };
  sender: string | null; // null for system notices
  text: string;
  kind: 'message' | 'system' | 'deleted';
  edited: boolean;
  attachments: ParsedAttachment[];
}

export interface ParsedExport {
  records: ParsedRecord[];
  participants: string[];
  /** Orders consistent with every date in the file. One entry means it is unambiguous. */
  possibleDateOrders: DateOrder[];
  /** Lines before the first recognisable message (e.g. a corrupt header). */
  orphanLines: number[];
  hasSeconds: boolean;
}

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const SPACES = /[   ]/g;

// [24/10/2026, 14:05:33] Name: text          (iOS)
const IOS_LINE =
  /^\[(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\]\s(.*)$/i;
// 24/10/2026, 14:05 - Name: text             (Android)
const ANDROID_LINE =
  /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\s[-–]\s(.*)$/i;

// Bounded quantifiers keep these linear on hostile input (no catastrophic backtracking).
const ATTACHED_IOS = /<attached:\s{0,4}([^>\n]{1,255})>/i;
const ATTACHED_ANDROID = /^(.+\.[A-Za-z0-9]{2,5}) \(file attached\)$/;
const OMITTED = /^(<Media omitted>|(image|video|audio|sticker|GIF|document) omitted|<.+ omitted>)$/i;
const DELETED = /^(This message was deleted\.?|You deleted this message\.?)$/i;
const EDITED_SUFFIX = '<this message was edited>';
const E2EE_NOTICE = /end-to-end encrypted/i;

function normalise(line: string): string {
  return line.replace(INVISIBLE, '').replace(SPACES, ' ').replace(/\r$/, '');
}

function to24h(h: number, meridiem: string | undefined): number {
  if (!meridiem) return h;
  const pm = meridiem.toLowerCase().startsWith('p');
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

function omittedKind(text: string): string {
  const m = /^(image|video|audio|sticker|GIF|document)/i.exec(text);
  return m ? m[1].toLowerCase() : 'media';
}

export function parseWhatsAppExport(raw: string): ParsedExport {
  const lines = raw.split('\n');
  const records: ParsedRecord[] = [];
  const orphanLines: number[] = [];
  let hasSeconds = false;

  lines.forEach((rawLine, i) => {
    const line = normalise(rawLine);
    const m = IOS_LINE.exec(line) ?? ANDROID_LINE.exec(line);
    if (!m) {
      const last = records[records.length - 1];
      if (last) {
        last.text += '\n' + line;
        last.lineEnd = i + 1;
      } else if (line.trim()) {
        orphanLines.push(i + 1);
      }
      return;
    }
    const [, a, b, c, hh, mm, ss, meridiem, rest] = m;
    if (ss) hasSeconds = true;
    const colon = rest.indexOf(': ');
    const sender = colon > 0 ? rest.slice(0, colon).trim() : null;
    records.push({
      lineStart: i + 1,
      lineEnd: i + 1,
      date: [Number(a), Number(b), Number(c)],
      time: { h: to24h(Number(hh), meridiem), m: Number(mm), s: ss ? Number(ss) : 0 },
      sender,
      text: sender ? rest.slice(colon + 2) : rest,
      kind: sender ? 'message' : 'system',
      edited: false,
      attachments: [],
    });
  });

  for (const r of records) {
    r.text = r.text.trimEnd();
    if (r.text.toLowerCase().endsWith(EDITED_SUFFIX)) {
      r.edited = true;
      r.text = r.text.slice(0, -EDITED_SUFFIX.length).trimEnd();
    }
    if (r.kind === 'system' && E2EE_NOTICE.test(r.text)) {
      // WhatsApp's own notice; shown attributed so it isn't read as a claim about hye.
      r.text = `WhatsApp said: “${r.text}” This describes WhatsApp, not this imported copy.`;
    }
    if (r.kind !== 'message') continue;
    if (DELETED.test(r.text)) {
      r.kind = 'deleted';
      r.text = '';
      continue;
    }
    const firstLine = r.text.split('\n')[0];
    const ios = ATTACHED_IOS.exec(firstLine);
    const android = ATTACHED_ANDROID.exec(firstLine);
    if (ios || android) {
      r.attachments.push({ fileName: (ios ?? android)![1].trim(), included: true });
      r.text = r.text.replace(ios ? ATTACHED_IOS : firstLine, '').trim();
    } else if (OMITTED.test(r.text.trim())) {
      r.attachments.push({ fileName: `${omittedKind(r.text.trim())} (not included in export)`, included: false });
      r.text = '';
    }
  }

  const participants = [...new Set(records.filter(r => r.sender).map(r => r.sender!))];
  return { records, participants, possibleDateOrders: detectDateOrders(records), orphanLines, hasSeconds };
}

function detectDateOrders(records: ParsedRecord[]): DateOrder[] {
  if (records.length === 0) return [];
  if (records.every(r => r.date[0] > 31)) return ['YMD'];
  const fits = (order: 'DMY' | 'MDY') =>
    records.every(({ date: [a, b] }) => {
      const [day, month] = order === 'DMY' ? [a, b] : [b, a];
      return day >= 1 && day <= 31 && month >= 1 && month <= 12;
    });
  const orders: DateOrder[] = [];
  if (fits('DMY')) orders.push('DMY');
  if (fits('MDY')) orders.push('MDY');
  return orders;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local wall-clock ISO string without offset, e.g. 2026-10-24T14:05:00. Returns null if invalid. */
export function recordTimestamp(r: ParsedRecord, order: DateOrder): string | null {
  const [a, b, c] = r.date;
  let y: number, mo: number, d: number;
  if (order === 'YMD') [y, mo, d] = [a, b, c];
  else if (order === 'DMY') [d, mo, y] = [a, b, c];
  else [mo, d, y] = [a, b, c];
  if (y < 100) y += 2000;
  const { h, m, s } = r.time;
  const probe = new Date(y, mo - 1, d, h, m, s);
  if (probe.getMonth() !== mo - 1 || probe.getDate() !== d || h > 23 || m > 59 || s > 59) return null;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** "WhatsApp Chat with Priya.txt" -> "Priya". Falls back to the participant list. */
export function titleFromFileName(fileName: string, participants: string[], me?: string): string {
  const m = /WhatsApp Chat (?:with|-)\s*(.+?)(?:\.txt|\.zip)?$/i.exec(fileName.trim());
  if (m) return m[1].trim();
  const others = participants.filter(p => p !== me);
  return others.slice(0, 3).join(', ') || 'Imported chat';
}
