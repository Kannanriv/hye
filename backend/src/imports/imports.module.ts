import { Logger, Module } from '@nestjs/common';
import type pg from 'pg';
import { AppConfig } from '../config/app-config.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { InMemoryDb } from '../persistence/in-memory-db.js';
import { PG_POOL } from '../persistence/persistence.module.js';
import { ImportsController } from './imports.controller.js';
import { IMPORTS_REPOSITORY, type ImportsRepository } from './imports.repository.js';
import { IMPORTS_OPTIONS, ImportsService, type ImportsOptions } from './imports.service.js';
import { InMemoryImportsRepository } from './in-memory-imports.repository.js';
import { PgImportsRepository } from './pg-imports.repository.js';

/**
 * Chat-history imports: idempotent job creation, batched resumable processing,
 * per-item outcomes and migration reports.
 *
 * TODO: server-side parsing of uploaded exports (S3 upload → ClamAV scan → parser worker)
 * and a background queue (e.g. BullMQ on REDIS_URL) that resumes `importing`/`paused`
 * jobs without a client request.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ImportsController],
  providers: [
    ImportsService,
    {
      provide: IMPORTS_OPTIONS,
      inject: [AppConfig],
      useFactory: (config: AppConfig): ImportsOptions => ({
        batchSize: config.get('IMPORT_BATCH_SIZE'),
        maxBatchesPerRun: config.get('IMPORT_MAX_BATCHES_PER_REQUEST'),
      }),
    },
    {
      provide: IMPORTS_REPOSITORY,
      inject: [PG_POOL, InMemoryDb],
      useFactory: (pool: pg.Pool | null, db: InMemoryDb): ImportsRepository => {
        if (pool) return new PgImportsRepository(pool);
        new Logger('Imports').warn('Using the in-memory imports repository (PERSISTENCE=memory)');
        return new InMemoryImportsRepository(db);
      },
    },
  ],
  exports: [ImportsService],
})
export class ImportsModule {}
