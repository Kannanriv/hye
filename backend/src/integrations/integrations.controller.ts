import { Controller, Get, Header } from '@nestjs/common';
import { INTEGRATIONS } from './catalog.js';

/**
 * Public capability matrix: what hye can and cannot do with each platform. It describes
 * the product, not the caller's accounts — there are no connected accounts to report
 * until OAuth integrations (integration_accounts) are built.
 */
@Controller('integrations')
export class IntegrationsController {
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  list() {
    return {
      kind: 'capability-matrix',
      note: 'Capabilities describe what hye supports per platform. No external accounts are connected.',
      integrations: INTEGRATIONS,
    };
  }
}
