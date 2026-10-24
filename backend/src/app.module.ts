import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { HttpThrottlerGuard } from './common/http-throttler.guard.js';
import { AppConfig, AppConfigModule } from './config/app-config.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { PersistenceModule } from './persistence/persistence.module.js';
import { PostsModule } from './posts/posts.module.js';
import { PrivacyModule } from './privacy/privacy.module.js';

/**
 * Modular monolith. Feature modules talk to each other only through exported services
 * (never each other's repositories), so any of them can later be split out.
 */
@Module({
  imports: [
    AppConfigModule,
    PersistenceModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: config.get('THROTTLE_TTL_MS'), limit: config.get('THROTTLE_LIMIT') }],
      }),
    }),
    AuditModule,
    HealthModule,
    IdentityModule,
    ConversationsModule,
    MessagingModule,
    ImportsModule,
    IntegrationsModule,
    PrivacyModule,
    PostsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
export class AppModule {}
