import { Injectable } from '@nestjs/common';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import type { SessionRecord, UserRecord } from '../persistence/records.js';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');

export interface UsersRepository {
  findById(id: string): Promise<UserRecord | null>;
  insert(user: UserRecord): Promise<void>;
}

export interface SessionsRepository {
  insert(session: SessionRecord): Promise<void>;
  findActiveByTokenHash(tokenHash: string, now: string): Promise<SessionRecord | null>;
  listActiveForUser(userId: string, now: string): Promise<SessionRecord[]>;
  touch(id: string, at: string): Promise<void>;
  /** Returns false when the session does not exist, belongs to someone else, or is already revoked. */
  revoke(id: string, userId: string, at: string): Promise<boolean>;
}

@Injectable()
export class InMemoryUsersRepository implements UsersRepository {
  constructor(private readonly db: InMemoryDb) {}

  async findById(id: string) {
    const u = this.db.users.get(id);
    return u && !u.deletedAt ? u : null;
  }

  async insert(user: UserRecord) {
    this.db.users.set(user.id, user);
  }
}

@Injectable()
export class InMemorySessionsRepository implements SessionsRepository {
  constructor(private readonly db: InMemoryDb) {}

  async insert(session: SessionRecord) {
    this.db.sessions.set(session.id, session);
  }

  async findActiveByTokenHash(tokenHash: string, now: string) {
    for (const s of this.db.sessions.values()) {
      if (s.tokenHash === tokenHash && !s.revokedAt && s.expiresAt > now) return s;
    }
    return null;
  }

  async listActiveForUser(userId: string, now: string) {
    return [...this.db.sessions.values()]
      .filter(s => s.userId === userId && !s.revokedAt && s.expiresAt > now)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
  }

  async touch(id: string, at: string) {
    const s = this.db.sessions.get(id);
    if (s) s.lastUsedAt = at;
  }

  async revoke(id: string, userId: string, at: string) {
    const s = this.db.sessions.get(id);
    if (!s || s.userId !== userId || s.revokedAt) return false;
    s.revokedAt = at;
    return true;
  }
}
