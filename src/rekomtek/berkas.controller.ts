import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

import { BerkasTemplateService } from './berkas-template.service';
import { BerkasService } from './berkas.service';
import { RekomtekService } from './rekomtek.service';
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
  @Permissions('rekomtek.berkas')
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
    return this.berkasService.returnForRevision(id, berkasId, dto, user);
  }

}
