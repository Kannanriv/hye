import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { AppConfig } from '../config/app-config.module.js';
import { InMemoryDb } from './in-memory-db.js';

/** Injection token for the shared pg.Pool, or null when PERSISTENCE=memory. */
export const PG_POOL = Symbol('PG_POOL');
export type PgPool = pg.Pool | null;

@Injectable()
class PgPoolLifecycle implements OnApplicationShutdown {
  private readonly logger = new Logger('Postgres');
  constructor(@Inject(PG_POOL) private readonly pool: PgPool) {}

  async onApplicationShutdown() {
    if (!this.pool) return;
    await this.pool.end();
    this.logger.log('connection pool closed');
  }
}

/**
 * Storage wiring shared by feature modules. Each feature module picks its own
 * repository implementation from PERSISTENCE, using these primitives.
 */
@Global()
@Module({
  providers: [
    InMemoryDb,
    {
      provide: PG_POOL,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PgPool => {
        if (config.get('PERSISTENCE') !== 'postgres') return null;
        const pool = new pg.Pool({
          connectionString: config.get('DATABASE_URL'),
          max: config.get('DATABASE_POOL_MAX'),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          application_name: 'hye-backend',
        });
        pool.on('error', err => new Logger('Postgres').error(`idle client error: ${err.message}`));
        return pool;
      },
    },
    PgPoolLifecycle,
  ],
  exports: [InMemoryDb, PG_POOL],
})
export class PersistenceModule {}
