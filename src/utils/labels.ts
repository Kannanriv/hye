import type { RetentionPolicy, SavedLink } from '@/domain/types';

export const RETENTION_LABEL: Record<RetentionPolicy, string> = { off: 'Keep forever', '24h': '24 hours', '7d': '7 days', '90d': '90 days' };

const AUDIT_LABEL: Record<string, string> = {
  'account.created': 'Account created',
  'privacy.changed': 'Privacy setting changed',
  'retention.changed': 'Message timer changed',
  'conversation.deleted': 'Chat deleted',
  'conversation.exported': 'Chat exported',
  'conversation.reported': 'Chat reported',
  'message.deleted': 'Message deleted',
  'contact.blocked': 'Contact blocked',
  'contact.unblocked': 'Contact unblocked',
  'group.created': 'Group created',
  'group.members': 'Group members changed',
  'group.left': 'Left group',
  'import.started': 'Import started',
  'import.completed': 'Import finished',
  'import.retried': 'Import retried',
  'imports.deleted': 'Imported history deleted',
  'data.exported': 'Data exported',
};

/** Plain-language name for a security activity entry. */
export const auditLabel = (action: string) => AUDIT_LABEL[action] ?? action;

const HOSTS: [RegExp, SavedLink['platform']][] = [
  [/(^|\.)instagram\.com$/, 'instagram'], [/(^|\.)(x|twitter)\.com$/, 'x'], [/(^|\.)(facebook|fb)\.com$/, 'messenger'],
  [/(^|\.)t\.me$/, 'telegram'], [/(^|\.)(wa\.me|whatsapp\.com)$/, 'whatsapp'],
];

/** Labels a saved link by host only. We never fetch the page. */
export function platformForUrl(url: string): SavedLink['platform'] {
  const host = /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? 'web';
}
