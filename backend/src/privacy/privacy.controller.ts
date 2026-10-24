import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type Principal } from '../common/principal.js';
import { SessionAuthGuard } from '../identity/session-auth.guard.js';
import { RequestDeletionDto } from './dto/privacy.dto.js';
import { PrivacyService, privacyRequestView } from './privacy.service.js';

@Controller('privacy')
@UseGuards(SessionAuthGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Ask for a copy of all your data. 202: queued (or already queued). */
  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestExport(@CurrentUser() user: Principal) {
    const { request } = await this.privacy.requestExport(user.userId);
    return privacyRequestView(request);
  }

  @Get('requests/:id')
  async get(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return privacyRequestView(await this.privacy.get(user.userId, id));
  }

  /** Schedule account deletion after the grace period (ACCOUNT_DELETION_GRACE_DAYS). */
  @Post('deletion')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestDeletion(@CurrentUser() user: Principal, @Body() dto: RequestDeletionDto) {
    const { request } = await this.privacy.requestDeletion(user.userId, dto.reason);
    return privacyRequestView(request);
  }

  /** Cancel a pending deletion during the grace period. */
  @Delete('deletion')
  async cancelDeletion(@CurrentUser() user: Principal) {
    return privacyRequestView(await this.privacy.cancelDeletion(user.userId));
  }
}
