import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/** The authenticated caller, attached to the request by SessionAuthGuard. */
export interface Principal {
  userId: string;
  /** Null when authenticated through the development header. */
  sessionId: string | null;
}

export interface RequestWithPrincipal {
  principal?: Principal;
  headers: Record<string, string | string[] | undefined>;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
  if (!req.principal) throw new UnauthorizedException();
  return req.principal;
});
