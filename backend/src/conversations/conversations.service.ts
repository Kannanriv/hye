import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { newId, nowIso } from '../common/ids.js';
import type { ConversationRecord, MemberRecord } from '../persistence/records.js';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository, type InboxRow } from './conversations.repository.js';
import type { CreateConversationDto, ListConversationsQueryDto, UpdateConversationDto } from './dto/conversation.dto.js';

export function conversationView(c: ConversationRecord, m: MemberRecord) {
  return {
    id: c.id,
    kind: c.kind,
    origin: c.origin,
    source: c.sourcePlatform,
    title: c.title,
    createdAt: c.createdAt,
    lastActivityAt: c.lastActivityAt,
    retention: c.retention,
    pinned: m.pinned,
    muted: m.muted,
    archived: m.archived,
    markedUnread: m.markedUnread,
    lastReadAt: m.lastReadAt,
    role: m.role,
    provenance: c.provenance
      ? { platform: c.sourcePlatform, jobId: c.provenance.importJobId, fileName: c.provenance.fileName, importedAt: c.provenance.importedAt, timezoneNote: c.provenance.timezoneNote }
      : undefined,
    importedParticipants: c.origin === 'imported' ? c.importedParticipants : undefined,
  };
}

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly repo: ConversationsRepository,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateConversationDto) {
    const others = dto.memberIds.map(id => id.toLowerCase()).filter(id => id !== userId);
    if (dto.kind === 'direct' && others.length !== 1) throw new BadRequestException('A direct conversation has exactly one other member');
    if (dto.kind === 'group' && others.length < 1) throw new BadRequestException('A group needs at least one other member');
    // TODO: verify member ids exist and that neither side has blocked the other (blocks table).
    const now = nowIso();
    const conversation: ConversationRecord = {
      id: newId(), kind: dto.kind, origin: 'native', sourcePlatform: 'hye', title: dto.title ?? '',
      createdByUserId: userId, retention: dto.retention ?? 'off', lastActivityAt: now, provenance: null,
      importedParticipants: [], createdAt: now, updatedAt: now, deletedAt: null,
    };
    const member = (id: string, role: MemberRecord['role']): MemberRecord => ({
      conversationId: conversation.id, userId: id, role, pinned: false, muted: false, archived: false,
      markedUnread: false, lastReadAt: null, lastActivityAt: now, joinedAt: now, leftAt: null,
    });
    const members = [member(userId, 'admin'), ...others.map(id => member(id, dto.kind === 'direct' ? 'admin' : 'member'))];
    await this.repo.insert(conversation, members);
    await this.audit.record({ userId, action: 'conversation.created', targetType: 'conversation', targetId: conversation.id });
    return conversationView(conversation, members[0]);
  }

  async list(userId: string, q: ListConversationsQueryDto) {
    const rows: InboxRow[] = await this.repo.listInbox(userId, { archived: q.archived === 'true', before: q.before, limit: q.limit });
    const items = rows.map(r => conversationView(r.conversation, r.membership));
    return { conversations: items, nextBefore: rows.length === q.limit ? rows[rows.length - 1].membership.lastActivityAt : null };
  }

  async get(userId: string, id: string) {
    const { conversation, membership } = await this.requireMember(userId, id);
    return conversationView(conversation, membership);
  }

  async update(userId: string, id: string, dto: UpdateConversationDto) {
    const { conversation, membership } = await this.requireMember(userId, id);
    const { retention, ...prefs } = dto;
    if (retention !== undefined && retention !== conversation.retention) {
      if (membership.role !== 'admin') throw new ForbiddenException('Only admins can change disappearing messages');
      await this.repo.updateRetention(id, retention);
      await this.audit.record({ userId, action: 'conversation.retention_changed', targetType: 'conversation', targetId: id, detail: retention });
    }
    await this.repo.updateMemberPrefs(id, userId, prefs);
    return this.get(userId, id);
  }

  /** Throws 404 (not 403) for non-members so conversation ids can't be probed. */
  async requireMember(userId: string, conversationId: string) {
    const conversation = await this.repo.findById(conversationId);
    const membership = conversation ? await this.repo.findMembership(conversationId, userId) : null;
    if (!conversation || !membership) throw new NotFoundException('Conversation not found');
    return { conversation, membership };
  }

  memberIds(conversationId: string): Promise<string[]> {
    return this.repo.listActiveMemberIds(conversationId);
  }

  touch(conversationId: string, at: string): Promise<void> {
    return this.repo.touch(conversationId, at);
  }
}
