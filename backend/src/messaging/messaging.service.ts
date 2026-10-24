import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Subject } from 'rxjs';
import { newId, nowIso } from '../common/ids.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import type { MessageRecord } from '../persistence/records.js';
import type { ListMessagesQueryDto, SendMessageDto } from './dto/message.dto.js';
import { MESSAGES_REPOSITORY, type MessagesRepository } from './messages.repository.js';

export type MessageView = ReturnType<typeof messageView>;

/** Domain events fanned out to sockets by MessagingGateway. */
export type MessagingEvent =
  | { type: 'message.new'; recipients: string[]; message: MessageView }
  | { type: 'message.status'; recipients: string[]; payload: { messageId: string; conversationId: string; userId: string; status: 'delivered' | 'read' } }
  | { type: 'typing'; recipients: string[]; payload: { conversationId: string; userId: string; isTyping: boolean } };

export function messageView(m: MessageRecord) {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderUserId ?? m.senderName,
    senderName: m.senderName,
    text: m.deletedAt ? '' : m.body,
    sentAt: m.sentAt,
    editedAt: m.editedAt ?? undefined,
    deletedAt: m.deletedAt ?? undefined,
    replyToId: m.replyToId ?? undefined,
    forwardedFrom: m.forwardedFrom ?? undefined,
    status: m.status ?? undefined,
    system: m.system || undefined,
    attachments: m.attachments.map(a => ({ id: a.id, kind: a.kind, fileName: a.fileName, missingReason: a.missingReason ?? undefined })),
    reactions: [] as { emoji: string; by: string }[],
    sourceKey: m.sourceKey ?? undefined,
    sourceRef: m.sourceRef ?? undefined,
    clientMessageId: m.clientMessageId ?? undefined,
  };
}

@Injectable()
export class MessagingService {
  /** In-process event bus. With several instances, the gateway's Redis adapter fans out across nodes. */
  readonly events = new Subject<MessagingEvent>();

  constructor(
    @Inject(MESSAGES_REPOSITORY) private readonly repo: MessagesRepository,
    private readonly conversations: ConversationsService,
  ) {}

  async send(userId: string, conversationId: string, dto: SendMessageDto): Promise<{ message: MessageView; created: boolean }> {
    const { conversation } = await this.conversations.requireMember(userId, conversationId);
    if (conversation.origin === 'imported') throw new ForbiddenException('Imported conversations are read-only');

    const existing = await this.repo.findByClientId(userId, dto.clientMessageId);
    if (existing) {
      if (existing.conversationId !== conversationId) throw new BadRequestException('clientMessageId already used in another conversation');
      return { message: messageView(existing), created: false };
    }
    if (dto.replyToId) {
      const parent = await this.repo.findById(dto.replyToId);
      if (!parent || parent.conversationId !== conversationId) throw new BadRequestException('replyToId is not a message in this conversation');
    }

    const now = nowIso();
    const record: MessageRecord = {
      id: newId(), conversationId, ownerUserId: userId, senderUserId: userId, senderName: '',
      clientMessageId: dto.clientMessageId, body: dto.text, system: false, sentAt: now, editedAt: null,
      deletedAt: null, replyToId: dto.replyToId ?? null, forwardedFrom: dto.forwardedFrom ?? null, status: 'sent',
      origin: 'native', sourcePlatform: 'hye', sourceKey: null, sourceRef: null, importJobId: null,
      attachments: [], createdAt: now, updatedAt: now,
    };
    // TODO: in Postgres, insert + touch in one transaction and enqueue push notifications (outbox).
    await this.repo.insert(record);
    await this.conversations.touch(conversationId, now);

    const view = messageView(record);
    this.events.next({ type: 'message.new', recipients: await this.conversations.memberIds(conversationId), message: view });
    return { message: view, created: true };
  }

  async list(userId: string, conversationId: string, q: ListMessagesQueryDto) {
    await this.conversations.requireMember(userId, conversationId);
    const rows = await this.repo.listTimeline(conversationId, { before: q.before, limit: q.limit });
    return { messages: rows.map(messageView), nextBefore: rows.length === q.limit ? rows[rows.length - 1].sentAt : null };
  }

  /** A recipient acknowledges delivery or read. Only the aggregate status is kept for now. */
  async acknowledge(userId: string, messageId: string, status: 'delivered' | 'read') {
    const message = await this.repo.findById(messageId);
    if (!message) throw new NotFoundException('Message not found');
    await this.conversations.requireMember(userId, message.conversationId);
    if (message.senderUserId === userId || message.origin === 'imported') return;
    const rank = { sending: 0, sent: 1, delivered: 2, read: 3, failed: -1 } as const;
    if (message.status && rank[status] <= rank[message.status]) return;
    // TODO: per-recipient rows in message_receipts; honour the reader's read-receipt setting.
    await this.repo.updateStatus(messageId, status);
    this.events.next({
      type: 'message.status',
      recipients: await this.conversations.memberIds(message.conversationId),
      payload: { messageId, conversationId: message.conversationId, userId, status },
    });
  }

  async typing(userId: string, conversationId: string, isTyping: boolean) {
    await this.conversations.requireMember(userId, conversationId);
    const recipients = (await this.conversations.memberIds(conversationId)).filter(id => id !== userId);
    this.events.next({ type: 'typing', recipients, payload: { conversationId, userId, isTyping } });
  }
}
