import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, type Principal } from '../common/principal.js';
import { SessionAuthGuard } from '../identity/session-auth.guard.js';
import { AuditService } from './audit.service.js';

@Controller('audit')
@UseGuards(SessionAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** The caller's own activity log (Settings → Security → Activity in the app). */
  @Get()
  async list(@CurrentUser() user: Principal, @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number) {
    const events = await this.audit.list(user.userId, limit);
    return {
      events: events.map(e => ({ id: e.id, at: e.createdAt, action: e.action, detail: e.detail, targetType: e.targetType, targetId: e.targetId })),
    };
  }
}
