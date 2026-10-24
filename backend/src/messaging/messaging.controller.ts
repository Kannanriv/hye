import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, type Principal } from '../common/principal.js';
import { SessionAuthGuard } from '../identity/session-auth.guard.js';
import { ListMessagesQueryDto, SendMessageDto } from './dto/message.dto.js';
import { MessagingService } from './messaging.service.js';

@Controller('conversations/:conversationId/messages')
@UseGuards(SessionAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  /** Newest first. Paginate with ?before=<nextBefore>. */
  @Get()
  list(
    @CurrentUser() user: Principal,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    return this.messaging.list(user.userId, conversationId, query);
  }

  /** 201 for a new message, 200 when the clientMessageId was already accepted (safe retry). */
  @Post()
  async send(
    @CurrentUser() user: Principal,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: SendMessageDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { message, created } = await this.messaging.send(user.userId, conversationId, dto);
    res.status(created ? 201 : 200);
    return message;
  }
}
