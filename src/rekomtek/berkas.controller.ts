import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

import { BerkasTemplateService } from './berkas-template.service';
import { BerkasService } from './berkas.service';
import { RekomtekService } from './rekomtek.service';
import { RekomtekWorkflowService } from './rekomtek-workflow.service';
import {
  UpdateBerkasDto,
  UpdateBerkasIsCompleteDto,
  BerkasQueryDto,
  ReturnForRevisionDto,
} from './dto/berkas.dto';

@ApiTags('Rekomtek - Berkas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rekomtek')
export class BerkasController {
  constructor(
    private readonly rekomtekService: RekomtekService,
    private readonly berkasTemplateService: BerkasTemplateService,
    private readonly berkasService: BerkasService,
    private readonly workflowService: RekomtekWorkflowService,
  ) {}

  // ── Template ───────────────────────────────────────────────

  @Get('berkas/templates')
  @Permissions('rekomtek.read')
  @ApiOperation({
    summary:
      'Daftar template checklist berkas berdasarkan jenis + jenisPermohonan',
  })
  getTemplates(@Query() query: BerkasQueryDto) {
    if (query.jenis && query.jenisPermohonan) {
      return this.berkasTemplateService.getTemplates(
        query.jenis,
        query.jenisPermohonan,
      );
    }
    return this.berkasTemplateService.getAllTemplates();
  }

  // ── Berkas per Rekomtek ────────────────────────────────────

  @Get(':id/berkas')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Daftar checklist berkas untuk rekomtek tertentu' })
  async getBerkas(
    @Param('id') id: string,
    @Query() query: BerkasQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.rekomtekService.canAccess(user, id);
    return this.berkasService.getByRekomtekId(id, query);
  }

  @Get(':id/berkas/progress')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Progress checklist berkas rekomtek' })
  async getProgress(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.rekomtekService.canAccess(user, id);
    return this.berkasService.getProgress(id);
  }

  @Patch(':id/berkas/:berkasId')
  @Permissions('rekomtek.berkas')
  @ApiOperation({ summary: 'Update link atau status checklist berkas' })
  async updateBerkas(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @Body() dto: UpdateBerkasDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.rekomtekService.canAccess(user, id, { forUpdate: true });
    return this.berkasService.update(id, berkasId, dto, user);
  }

  @Post(':id/berkas/:berkasId/validate')
  @Permissions('rekomtek.berkas')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Coba lagi validasi teknis checklist berkas' })
  async validate(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const access = await this.rekomtekService.canAccess(user, id);
    if (
      access.status === 'APPROVED' ||
      access.status === 'PUBLISHED' ||
      access.status === 'REJECTED'
    ) {
      throw new BadRequestException(
        'Checklist tidak dapat divalidasi ulang setelah rekomtek berstatus REJECTED, disetujui, atau diterbitkan',
      );
    }
    return this.berkasService.revalidateItem(id, berkasId);
  }

  @Get(':id/berkas/:berkasId/file')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Unduh file privat checklist dengan authorization' })
  async getFile(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    await this.rekomtekService.canAccess(user, id);
    const file = await this.berkasService.getFileForReviewer(id, berkasId);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Length', file.size);
    response.setHeader('Content-Disposition', 'attachment');
    (file.stream as { pipe: (target: Response) => void }).pipe(response);
  }

  @Patch(':id/berkas/:berkasId/complete')
  @Permissions('rekomtek.berkas')
  @ApiOperation({ summary: 'Centang / uncentang kelengkapan berkas' })
  async setComplete(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @Body() dto: UpdateBerkasIsCompleteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.rekomtekService.canAccess(user, id, { forUpdate: true });
    return this.berkasService.update(id, berkasId, dto, user);
  }

  @Patch(':id/berkas/:berkasId/return')
  @Permissions('rekomtek.evaluate')
  @ApiOperation({
    summary: 'Kembalikan berkas untuk direvisi (uncheck + catatan revisi)',
  })
  async returnForRevision(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @Body() dto: ReturnForRevisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.rekomtekService.canAccess(user, id, { forUpdate: true });
    return this.workflowService.legacyReturnInitial(
      id,
      berkasId,
      dto.revisionNote,
      user,
    );
  }
}
