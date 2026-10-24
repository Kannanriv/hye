import type { SourcePlatform } from '../common/domain.js';
import type { ConversationRecord, ImportItemRecord, ImportJobRecord, MessageRecord } from '../persistence/records.js';

export const IMPORTS_REPOSITORY = Symbol('IMPORTS_REPOSITORY');

/** Thrown by insertJob when (owner, platform, file hash) already exists. */
export class DuplicateImportError extends Error {
  constructor() {
    super('An import job for this file already exists');
  }
}

export interface ItemOutcomeUpdate {
  seq: number;
  outcome: 'imported' | 'skipped' | 'failed';
  reason: string | null;
  messageId: string | null;
}

/**
 * Everything the import pipeline reads or writes. Implementations must make each
 * call inside `transaction()` atomic with the others, so a batch's messages, item
 * outcomes and the advanced job cursor commit together or not at all.
 */
export interface ImportsStore {
  findJobByFileHash(ownerUserId: string, platform: SourcePlatform, fileHash: string): Promise<ImportJobRecord | null>;
  /** forUpdate locks the job row (SELECT ... FOR UPDATE) so concurrent workers serialize per job. */
  getJob(jobId: string, opts?: { forUpdate?: boolean }): Promise<ImportJobRecord | null>;
  insertJob(job: ImportJobRecord): Promise<void>;
  updateJob(job: ImportJobRecord): Promise<void>;

  getConversation(conversationId: string): Promise<ConversationRecord | null>;
  isConversationMember(conversationId: string, userId: string): Promise<boolean>;
  /** Creates an imported conversation with the importing user as its only (admin) member. */
  insertImportedConversation(conversation: ConversationRecord, ownerUserId: string): Promise<void>;
  linkConversationToJob(conversationId: string, jobId: string): Promise<void>;
  touchConversation(conversationId: string, lastActivityAt: string): Promise<void>;

  /** Persists the plan so processing can resume after a crash. */
  stageItems(items: ImportItemRecord[]): Promise<void>;
  /** Items with seq >= fromSeq, ascending, at most `limit`. */
  listItemsFrom(jobId: string, fromSeq: number, limit: number): Promise<ImportItemRecord[]>;
  recordOutcomes(jobId: string, updates: ItemOutcomeUpdate[], processedAt: string): Promise<void>;
  /** Skipped and failed items, in plan order (the report lists problems, successes are counted). */
  listProblemItems(jobId: string, limit: number): Promise<ImportItemRecord[]>;

  /**
   * Inserts messages, silently ignoring any whose (ownerUserId, sourcePlatform, sourceKey)
   * already exists. Returns the source keys that were actually inserted.
   */
  insertMessagesIgnoringDuplicates(messages: MessageRecord[]): Promise<Set<string>>;
}

export interface ImportsRepository extends ImportsStore {
  transaction<T>(fn: (store: ImportsStore) => Promise<T>): Promise<T>;
}
