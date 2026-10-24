import type { RetentionPolicy, SavedLink } from '@/domain/types';

export const RETENTION_LABEL: Record<RetentionPolicy, string> = { off: 'Keep forever', '24h': '24 hours', '7d': '7 days', '90d': '90 days' };

const HOSTS: [RegExp, SavedLink['platform']][] = [
  [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)(x|twitter)\.com$/, 'x'], [/(^|\.)(facebook|fb)\.com$/, 'messenger'],
  [/(^|\.)t\.me$/, 'telegram'], [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
];

/** Labels a saved link by host only. We never fetch the page. */
export function platformForUrl(url: string): SavedLink['platform'] {
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? 'web';
}
