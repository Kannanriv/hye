import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, type Principal } from '../common/principal.js';
import { SessionAuthGuard } from '../identity/session-auth.guard.js';
import { CreateImportDto } from './dto/create-import.dto.js';
import { ImportsService } from './imports.service.js';

@Controller('imports')
@UseGuards(SessionAuthGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  /**
   * Creates an import job from the client's planned items and processes it.
   *  - 201: new job. Large jobs come back `paused` after IMPORT_MAX_BATCHES_PER_REQUEST
   *    batches; call POST /imports/:id/resume until `completed`.
   *  - 200: this file (same SHA-256) was already submitted; the existing job is returned
   *    unchanged and nothing is imported twice.
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(@CurrentUser() user: Principal, @Body() dto: CreateImportDto, @Res({ passthrough: true }) res: Response) {
    const { job, created } = await this.imports.create(user.userId, dto);
    if (!created) {
      res.status(HttpStatus.OK);
      return { ...(await this.imports.view(user.userId, job.id)), duplicate: true };
    }
    await this.imports.run(job.id);
    return this.imports.view(user.userId, job.id);
  }

  @Get(':id')
  get(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.view(user.userId, id);
  }

  @Get(':id/report')
  report(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.report(user.userId, id);
  }

  /** Continues from the saved cursor. Safe to call repeatedly. */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(@CurrentUser() user: Principal, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.imports.resume(user.userId, id);
    return this.imports.view(user.userId, id);
  }
}
