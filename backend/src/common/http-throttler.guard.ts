import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Global rate limit for HTTP routes. WebSocket events are skipped here (the stock guard
 * expects an HTTP request); socket.io connections are limited at the edge / per-event in
 * the gateway instead.
 *
 * Storage is in-process. With several instances use a shared store
 * (e.g. @nest-lab/throttler-storage-redis on REDIS_URL) so limits apply cluster-wide.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return context.getType() !== 'http' || super.shouldSkip(context);
  }
}
