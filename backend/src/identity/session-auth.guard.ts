import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { RequestWithPrincipal } from '../common/principal.js';
import { SessionsService } from './sessions.service.js';

export const DEV_USER_HEADER = 'x-hye-dev-user';

/**
 * Resolves `Authorization: Bearer <session token>` to a Principal. When AUTH_DEV_HEADER
 * is on (never in production) `x-hye-dev-user: <uuid>` is accepted instead.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const auth = header(req, 'authorization');
    if (auth?.startsWith('Bearer ')) {
      const principal = await this.sessions.authenticate(auth.slice(7).trim());
      if (principal) {
        req.principal = principal;
        return true;
      }
      throw new UnauthorizedException('Invalid or expired session');
    }
    const devUser = header(req, DEV_USER_HEADER);
    if (devUser) {
      const principal = await this.sessions.authenticateDevUser(devUser);
      if (principal) {
        req.principal = principal;
        return true;
      }
    }
    throw new UnauthorizedException('Authentication required');
  }
}

function header(req: RequestWithPrincipal, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}
