import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { ConversationsController } from './conversations.controller.js';
import { CONVERSATIONS_REPOSITORY, InMemoryConversationsRepository } from './conversations.repository.js';
import { ConversationsService } from './conversations.service.js';

/**
 * Conversations, membership and per-member inbox state.
 * TODO: Postgres implementation of ConversationsRepository.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, { provide: CONVERSATIONS_REPOSITORY, useClass: InMemoryConversationsRepository }],
  exports: [ConversationsService],
})
export class ConversationsModule {}
