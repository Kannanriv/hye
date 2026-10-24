import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type Principal } from '../common/principal.js';
import { SessionAuthGuard } from '../identity/session-auth.guard.js';
import { ConversationsService } from './conversations.service.js';
import { CreateConversationDto, ListConversationsQueryDto, UpdateConversationDto } from './dto/conversation.dto.js';

@Controller('conversations')
@UseGuards(SessionAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  /** Inbox, most recent activity first. Paginate with ?before=<nextBefore>. */
  @Get()
  list(@CurrentUser() user: Principal, @Query() query: ListConversationsQueryDto) {
    return this.conversations.list(user.userId, query);
  }

  @Post()
  create(@CurrentUser() user: Principal, @Body() dto: CreateConversationDto) {
    return this.conversations.create(user.userId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.conversations.get(user.userId, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateConversationDto) {
    return this.conversations.update(user.userId, id, dto);
  }
}
