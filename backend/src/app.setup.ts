import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AppConfig } from './config/app-config.module.js';
import { HyeIoAdapter } from './messaging/ws-adapter.js';

/**
 * HTTP pipeline shared by main.ts and the e2e tests, so tests exercise the same
 * security headers, validation and body limits as production.
 * The app must be created with `{ bodyParser: false }` (parsers are registered here).
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfig);

  app.use(requestLogger()); // first, so requests rejected later (413, 400) are logged too
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind one load balancer / ingress; adjust to your topology
  app.use(helmet());
  const origins = config.corsOrigins;
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  const limit = `${config.get('MAX_UPLOAD_MB')}mb`;
  app.useBodyParser('json', { limit });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: false });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  app.useWebSocketAdapter(new HyeIoAdapter(app, origins));
}

/** One structured log line per request, tagged with a request id (propagated or generated). */
function requestLogger() {
  const logger = new Logger('HTTP');
  return (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    const incoming = req.header('x-request-id');
    const requestId = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      const entry = {
        msg: 'request',
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0], // never log query strings: they may carry tokens
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - started) / 1e6,
      };
      if (res.statusCode >= 500) logger.error(entry);
      else logger.log(entry);
    });
    next();
  };
}
