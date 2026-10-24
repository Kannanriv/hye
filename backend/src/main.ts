import 'reflect-metadata';
import { ConsoleLogger, Logger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config/app-config.module.js';

const LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

async function bootstrap() {
  // JSON lines on stdout: one object per log entry, ready for any log shipper.
  const logger = new ConsoleLogger({ json: true, colors: false });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger, bodyParser: false });

  const config = app.get(AppConfig);
  const level = config.get('LOG_LEVEL');
  app.useLogger(new ConsoleLogger({ json: true, colors: false, logLevels: LEVELS.slice(0, LEVELS.indexOf(level) + 1) }));
  configureApp(app);

  // SIGTERM/SIGINT → stop accepting connections, run onModuleDestroy/onApplicationShutdown
  // hooks (close sockets, drain the pg pool), then exit. Force-exit if that hangs.
  app.enableShutdownHooks();
  const timeoutMs = config.get('SHUTDOWN_TIMEOUT_MS');
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      Logger.log({ msg: 'shutting down', signal }, 'Bootstrap');
      setTimeout(() => {
        Logger.error({ msg: 'graceful shutdown timed out, forcing exit', timeoutMs }, 'Bootstrap');
        process.exit(1);
      }, timeoutMs).unref();
    });
  }

  const port = config.get('PORT');
  await app.listen(port, '0.0.0.0');
  Logger.log({ msg: 'hye backend listening', port, persistence: config.get('PERSISTENCE'), env: config.get('NODE_ENV') }, 'Bootstrap');
}

process.on('unhandledRejection', reason => {
  Logger.error({ msg: 'unhandled promise rejection', reason: String(reason) }, 'Process');
});

bootstrap().catch(err => {
  // Config validation errors land here: print and exit non-zero.
  console.error(JSON.stringify({ level: 'fatal', msg: 'failed to start', error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
