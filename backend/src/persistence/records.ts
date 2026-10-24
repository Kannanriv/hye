// Row shapes shared by the repository implementations. Field names are the camelCase
// form of the columns in db/migrations/001_init.sql; timestamps are ISO strings.
import type {
  AttachmentKind, ConversationKind, ConversationOrigin, DateOrder, DeliveryStatus, ImportOutcome,
  ImportStatus, MemberRole, RetentionPolicy, SourcePlatform,
} from '../common/domain.js';

export interface UserRecord {
  id: string;
  /** E.164 mobile number; the sign-in identifier. */
  phone: string;
  phoneVerifiedAt: string | null;
  /** Optional public username (unique when present). */
  handle: string | null;
  displayName: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SessionRecord {
  id: string;
  userId: string;
  /** hex SHA-256 of the bearer token */
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface ImportProvenanceRecord {
  importJobId: string | null;
  fileName: string;
  importedAt: string;
  timezoneNote: string;
}

export interface ConversationRecord {
  id: string;
  kind: ConversationKind;
  origin: ConversationOrigin;
  sourcePlatform: SourcePlatform;
  title: string;
  createdByUserId: string | null;
  retention: RetentionPolicy;
  lastActivityAt: string;
  provenance: ImportProvenanceRecord | null;
  importedParticipants: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MemberRecord {
  conversationId: string;
  userId: string;
  role: MemberRole;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  markedUnread: boolean;
  lastReadAt: string | null;
  lastActivityAt: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface AttachmentRecord {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  storageKey: string | null;
  missingReason: string | null;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  ownerUserId: string;
  senderUserId: string | null;
  senderName: string;
  clientMessageId: string | null;
  body: string;
  system: boolean;
  sentAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToId: string | null;
  forwardedFrom: string | null;
  status: DeliveryStatus | null;
  origin: ConversationOrigin;
  sourcePlatform: SourcePlatform;
  sourceKey: string | null;
  sourceRef: string | null;
  importJobId: string | null;
  attachments: AttachmentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportJobRecord {
  id: string;
  ownerUserId: string;
  conversationId: string;
  platform: Exclude<SourcePlatform, 'hye'>;
  fileName: string;
  fileHash: string;
  status: ImportStatus;
  dateOrder: DateOrder;
  me: string | null;
  timezoneNote: string | null;
  total: number;
  cursor: number;
  imported: number;
  skipped: number;
  failed: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The planned message a client sends for one export record (PlannedItem.message). */
export interface PlannedMessage {
  senderName: string;
  isMe: boolean;
  text: string;
  sentAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  system?: boolean;
  attachments?: { kind: AttachmentKind; fileName: string; missingReason?: string | null }[];
}

export interface ImportItemRecord {
  jobId: string;
  seq: number;
  sourceKey: string;
  sourceRef: string;
  payload: PlannedMessage | null;
  parseError: string | null;
  outcome: ImportOutcome | null;
  reason: string | null;
  messageId: string | null;
  processedAt: string | null;
}

export interface AuditEventRecord {
  id: string;
  userId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type PostKind = 'text' | 'photo' | 'reel';
export type PostAudience = 'everyone' | 'contacts';

export interface PostMediaRecord {
  kind: 'image' | 'video';
  /** S3 object key of an uploaded, scanned file. */
  storageKey: string;
  posterStorageKey: string | null;
  aspectRatio: number | null;
}

export interface PostRecord {
  id: string;
  authorUserId: string;
  kind: PostKind;
  body: string;
  audience: PostAudience;
  replyToId: string | null;
  quoteOfId: string | null;
  media: PostMediaRecord[];
  likeCount: number;
  repostCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type PrivacyRequestKind = 'export' | 'deletion';
export type PrivacyRequestStatus = 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';

export interface PrivacyRequestRecord {
  id: string;
  userId: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  scheduledFor: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
