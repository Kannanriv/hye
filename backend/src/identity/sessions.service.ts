import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { AppConfig } from '../config/app-config.module.js';
import { newId, nowIso, randomToken, sha256 } from '../common/ids.js';
import type { Principal } from '../common/principal.js';
import type { SessionRecord } from '../persistence/records.js';
import {
  SESSIONS_REPOSITORY, type SessionsRepository, USERS_REPOSITORY, type UsersRepository,
} from './identity.repository.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SessionView {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

/**
 * Opaque bearer sessions. The token is returned once to the client; only its SHA-256 is
 * stored, so a database leak does not leak usable sessions.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(SESSIONS_REPOSITORY) private readonly sessions: SessionsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  /** Called by the passkey login flow once it exists. */
  async issue(userId: string, meta: { userAgent?: string; ip?: string } = {}): Promise<{ token: string; session: SessionRecord }> {
    const token = randomToken();
    const now = new Date();
    const session: SessionRecord = {
      id: newId(),
      userId,
      tokenHash: sha256(token).toString('hex'),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.get('SESSION_TTL_DAYS') * 86_400_000).toISOString(),
      revokedAt: null,
    };
    await this.sessions.insert(session);
    await this.audit.record({ userId, action: 'session.created', targetType: 'session', targetId: session.id });
    return { token, session };
  }

  async authenticate(token: string): Promise<Principal | null> {
    if (!token || token.length > 256) return null;
    const now = nowIso();
    const session = await this.sessions.findActiveByTokenHash(sha256(token).toString('hex'), now);
    if (!session) return null;
    await this.sessions.touch(session.id, now);
    return { userId: session.userId, sessionId: session.id };
  }

  /**
   * Development-only identity: a UUID passed in a header. A matching user is created on
   * first use so the in-memory app is usable before passkey login exists.
   */
  async authenticateDevUser(userId: string): Promise<Principal | null> {
    if (!this.config.get('AUTH_DEV_HEADER') || this.config.isProduction || !UUID_RE.test(userId)) return null;
    const id = userId.toLowerCase();
    if (!(await this.users.findById(id))) {
      const now = nowIso();
      // Placeholder number in the reserved fictional range; real users verify a phone via OTP.
      const digits = String(parseInt(id.replace(/-/g, '').slice(0, 10), 16) % 10_000_000).padStart(7, '0');
      await this.users.insert({
        id, phone: `+1555${digits}`, phoneVerifiedAt: null, handle: null, displayName: `Dev ${id.slice(0, 8)}`,
        email: null, createdAt: now, updatedAt: now, deletedAt: null,
      });
    }
    return { userId: id, sessionId: null };
  }

  async list(principal: Principal): Promise<SessionView[]> {
    const rows = await this.sessions.listActiveForUser(principal.userId, nowIso());
    return rows.map(s => ({
      id: s.id, current: s.id === principal.sessionId, userAgent: s.userAgent, ip: s.ip,
      createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, expiresAt: s.expiresAt,
    }));
  }

  async revoke(principal: Principal, sessionId: string): Promise<void> {
    const ok = await this.sessions.revoke(sessionId, principal.userId, nowIso());
    if (!ok) throw new NotFoundException('Session not found');
    await this.audit.record({ userId: principal.userId, action: 'session.revoked', targetType: 'session', targetId: sessionId });
  }
}
