import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser, type Principal } from '../common/principal.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionsService } from './sessions.service.js';

@Controller('sessions')
@UseGuards(SessionAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  /** Signed-in devices for the caller. */
  @Get()
  async list(@CurrentUser() user: Principal) {
    return { sessions: await this.sessions.list(user) };
  }

  /** Sign a device out. Revoking the current session signs the caller out. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.sessions.revoke(user, id);
  }
}
