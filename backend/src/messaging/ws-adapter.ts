import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * socket.io adapter with CORS taken from config and conservative payload limits.
 *
 * Horizontal scaling: extend this to attach `@socket.io/redis-adapter`
 * (`server.adapter(createAdapter(pub, sub))` with two ioredis/redis clients on REDIS_URL)
 * so room emits reach sockets connected to other instances.
 */
export class HyeIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly corsOrigins: string[]) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins.length ? this.corsOrigins : false, credentials: true },
      maxHttpBufferSize: 1_000_000,
      pingInterval: 25_000,
      pingTimeout: 20_000,
    } as ServerOptions) as Server;
  }
}
