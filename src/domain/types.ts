// Domain model for the on-device prototype. Mirrors backend/db/migrations/001_init.sql
// so the shapes carry over when the NestJS backend replaces local storage.

export type SourcePlatform = 'hye' | 'whatsapp' | 'telegram' | 'instagram' | 'messenger' | 'x' | 'email';

/** native = created in hye; imported = history from a user-provided export (read-only, never synced). */
export type ConversationOrigin = 'native' | 'imported';

export type ConversationKind = 'direct' | 'group';

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type RetentionPolicy = 'off' | '24h' | '7d' | '90d';

export interface User {
  id: string;
  displayName: string;
  handle: string;
  email: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  displayName: string;
  handle: string;
  /** Demo contacts are simulated people bundled with the prototype. */
  isDemo: boolean;
  blocked?: boolean;
}

export interface Member {
  contactId: string; // 'me' for the current user
  role: 'admin' | 'member';
}

export interface ImportProvenance {
  platform: SourcePlatform;
  jobId: string;
  fileName: string;
  importedAt: string;
  /** Source exports often lack time zones; we record what the export gave us. */
  timezoneNote: string;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  origin: ConversationOrigin;
  source: SourcePlatform;
  title: string;
  members: Member[];
  createdAt: string;
  lastActivityAt: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  markedUnread: boolean;
  retention: RetentionPolicy;
  /** Messages from others after this time count as unread. */
  lastReadAt: string;
  provenance?: ImportProvenance;
  /** Display names of participants found in an imported export (no hye accounts behind them). */
  importedParticipants?: string[];
}

export interface Attachment {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  fileName: string;
  uri?: string; // absent when the export omitted the file
  missingReason?: string;
}

export interface Reaction {
  emoji: string;
  by: string; // contactId or 'me'
}

export interface Message {
  id: string;
  conversationId: string;
  /** 'me', a contactId, or the raw sender name for imported messages. */
  senderId: string;
  senderName: string;
  text: string;
  /** ISO string. For imports without a time zone this is the local wall-clock time, see provenance. */
  sentAt: string;
  editedAt?: string;
  deletedAt?: string;
  replyToId?: string;
  forwardedFrom?: string;
  reactions: Reaction[];
  attachments: Attachment[];
  status?: DeliveryStatus;
  system?: boolean;
  /** Stable key derived from the source export; makes re-imports idempotent. */
  sourceKey?: string;
  /** Original line numbers in the export, for audit and retry. */
  sourceRef?: string;
}

export type ImportStatus = 'validating' | 'ready' | 'importing' | 'paused' | 'completed' | 'failed';

export interface ImportItemResult {
  ref: string;
  outcome: 'imported' | 'skipped' | 'failed';
  reason?: string;
}

export interface ImportJob {
  id: string;
  platform: SourcePlatform;
  fileName: string;
  conversationId: string;
  status: ImportStatus;
  createdAt: string;
  completedAt?: string;
  total: number;
  /** Index of the next parsed record to process; persisted after every batch so imports resume. */
  cursor: number;
  imported: number;
  skipped: number;
  failed: number;
  results: ImportItemResult[];
  dateOrder: 'DMY' | 'MDY' | 'YMD';
  /** Which export participant the user said was them, so their messages show as outgoing. */
  me: string | null;
}

export interface SavedLink {
  id: string;
  url: string;
  note: string;
  platform: SourcePlatform | 'web';
  savedAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  detail: string;
}

export interface PrivacySettings {
  readReceipts: boolean;
  typingIndicators: boolean;
  lastSeen: 'everyone' | 'contacts' | 'nobody';
  defaultRetention: RetentionPolicy;
}

export interface NotificationPrefs {
  messages: boolean;
  groups: boolean;
  importComplete: boolean;
  previews: boolean;
}

export interface AppState {
  version: 1;
  user: User | null;
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  importJobs: ImportJob[];
  savedLinks: SavedLink[];
  audit: AuditEvent[];
  privacy: PrivacySettings;
  notifications: NotificationPrefs;
  theme: 'system' | 'light' | 'dark';
}
