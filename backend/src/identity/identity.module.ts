import { Module } from '@nestjs/common';
import {
  InMemorySessionsRepository, InMemoryUsersRepository, SESSIONS_REPOSITORY, USERS_REPOSITORY,
} from './identity.repository.js';
import { OtpController } from './otp.controller.js';
import { PasskeysController } from './passkeys.controller.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

/**
 * Accounts (phone + one-time code, optional passkeys) and sessions. Other modules import
 * this for SessionAuthGuard.
 * TODO: Postgres implementations of UsersRepository / SessionsRepository.
 */
@Module({
  controllers: [OtpController, PasskeysController, SessionsController],
  providers: [
    SessionsService,
    SessionAuthGuard,
    { provide: USERS_REPOSITORY, useClass: InMemoryUsersRepository },
    { provide: SESSIONS_REPOSITORY, useClass: InMemorySessionsRepository },
  ],
  exports: [SessionsService, SessionAuthGuard],
})
export class IdentityModule {}
