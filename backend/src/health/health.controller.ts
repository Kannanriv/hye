import { Controller, Get, Inject, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PG_POOL, type PgPool } from '../persistence/persistence.module.js';

/**
 * Liveness/readiness for load balancers and orchestrators. 503 when a configured
 * dependency is down, so the instance is taken out of rotation.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: PgPool) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const database = await this.database();
    const ok = database !== 'down';
    res.status(ok ? 200 : 503);
    return {
      status: ok ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database },
    };
  }

  private async database(): Promise<'up' | 'down' | 'not_configured'> {
    if (!this.pool) return 'not_configured';
    try {
      await this.pool.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
