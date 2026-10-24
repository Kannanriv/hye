import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { InMemoryMessagesRepository, MESSAGES_REPOSITORY } from './messages.repository.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingGateway } from './messaging.gateway.js';
import { MessagingService } from './messaging.service.js';

/**
 * Sending and reading native messages over REST, plus the realtime gateway.
 * TODO: Postgres implementation of MessagesRepository; attachments upload (S3 presigned
 * PUT → ClamAV scan → message_attachments.scan_status); reactions; edits/deletes.
 */
@Module({
  imports: [IdentityModule, ConversationsModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingGateway, { provide: MESSAGES_REPOSITORY, useClass: InMemoryMessagesRepository }],
  exports: [MessagingService],
})
export class MessagingModule {}
