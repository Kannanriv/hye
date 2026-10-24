// Server-side copy of the shared vocabulary in ../../../src/domain/types.ts.
// Keep the two in sync; the enum values must match db/migrations/001_init.sql.

export const SOURCE_PLATFORMS = ['hye', 'whatsapp', 'telegram', 'instagram', 'messenger', 'x', 'email'] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];
/** Platforms history can be imported from (everything except hye itself). */
export const IMPORT_PLATFORMS = SOURCE_PLATFORMS.filter(p => p !== 'hye') as Exclude<SourcePlatform, 'hye'>[];

export type ConversationOrigin = 'native' | 'imported';
export const CONVERSATION_KINDS = ['direct', 'group'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];
export type MemberRole = 'admin' | 'member';

export const DELIVERY_STATUSES = ['sending', 'sent', 'delivered', 'read', 'failed'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const RETENTION_POLICIES = ['off', '24h', '7d', '90d'] as const;
export type RetentionPolicy = (typeof RETENTION_POLICIES)[number];

export const ATTACHMENT_KINDS = ['image', 'video', 'audio', 'document', 'other'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export type ImportStatus = 'validating' | 'ready' | 'importing' | 'paused' | 'completed' | 'failed';
export type ImportOutcome = 'imported' | 'skipped' | 'failed';
export const DATE_ORDERS = ['DMY', 'MDY', 'YMD'] as const;
export type DateOrder = (typeof DATE_ORDERS)[number];
