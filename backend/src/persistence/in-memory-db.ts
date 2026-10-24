import type {
  AuditEventRecord, ConversationRecord, ImportItemRecord, ImportJobRecord, MemberRecord, MessageRecord,
  PostRecord, PrivacyRequestRecord, SessionRecord, UserRecord,
} from './records.js';

/**
 * Process-local tables backing the in-memory repositories. Used by tests and by local
 * development without Postgres. Not durable and not shared between instances.
 */
export class InMemoryDb {
  users = new Map<string, UserRecord>();
  sessions = new Map<string, SessionRecord>();
  conversations = new Map<string, ConversationRecord>();
  /** keyed by conversationId */
  members = new Map<string, MemberRecord[]>();
  messages = new Map<string, MessageRecord>();
  importJobs = new Map<string, ImportJobRecord>();
  /** keyed by jobId, ordered by seq */
  importItems = new Map<string, ImportItemRecord[]>();
  auditEvents: AuditEventRecord[] = [];
  privacyRequests = new Map<string, PrivacyRequestRecord>();
  posts = new Map<string, PostRecord>();
  /** postId → user ids who liked it */
  postLikes = new Map<string, Set<string>>();
  /** follower → followees */
  follows = new Map<string, Set<string>>();

  private tail: Promise<unknown> = Promise.resolve();

  /**
   * Serializes `fn` against other transactions and restores every table if it throws,
   * which is what a Postgres transaction gives the real implementation.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      const snapshot = this.snapshot();
      try {
        return await fn();
      } catch (err) {
        this.restore(snapshot);
        throw err;
      }
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private snapshot() {
    return structuredClone({
      users: this.users,
      sessions: this.sessions,
      conversations: this.conversations,
      members: this.members,
      messages: this.messages,
      importJobs: this.importJobs,
      importItems: this.importItems,
      auditEvents: this.auditEvents,
      privacyRequests: this.privacyRequests,
      posts: this.posts,
      postLikes: this.postLikes,
      follows: this.follows,
    });
  }

  private restore(s: ReturnType<InMemoryDb['snapshot']>) {
    Object.assign(this, s);
  }
}
