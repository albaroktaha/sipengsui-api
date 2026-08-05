import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

import { BerkasTemplateService } from './berkas-template.service';
import { BerkasService } from './berkas.service';
import { BerkasFileService } from './berkas-file.service';
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
    private readonly berkasTemplateService: BerkasTemplateService,
    private readonly berkasService: BerkasService,
    private readonly berkasFileService: BerkasFileService,
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
  getBerkas(@Param('id') id: string) {
    return this.berkasService.getByRekomtekId(id);
  }

  @Get(':id/berkas/progress')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Progress checklist berkas rekomtek' })
  getProgress(@Param('id') id: string) {
    return this.berkasService.getProgress(id);
  }

  @Patch(':id/berkas/:berkasId')
  @Permissions('rekomtek.berkas')
  @ApiOperation({ summary: 'Update status/notes checklist berkas' })
  updateBerkas(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @Body() dto: UpdateBerkasDto,
  ) {
    return this.berkasService.update(id, berkasId, dto);
  }

  @Patch(':id/berkas/:berkasId/complete')
  @Permissions('rekomtek.berkas')
  @ApiOperation({ summary: 'Centang / uncentang kelengkapan berkas' })
  setComplete(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @Body() dto: UpdateBerkasIsCompleteDto,
  ) {
    return this.berkasService.update(id, berkasId, dto);
  }

  @Patch(':id/berkas/:berkasId/return')
  @Permissions('rekomtek.berkas')
  @ApiOperation({
    summary: 'Kembalikan berkas untuk direvisi (uncheck + catatan revisi)',
  })
  returnForRevision(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @Body() dto: ReturnForRevisionDto,
  ) {
    return this.berkasService.returnForRevision(id, berkasId, dto);
  }

  // ── File Upload ────────────────────────────────────────────

  @Post(':id/berkas/:berkasId/upload')
  @Permissions('rekomtek.berkas')
  @ApiOperation({ summary: 'Upload file untuk berkas tertentu' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  uploadFile(
    @Param('id') id: string,
    @Param('berkasId') berkasId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.berkasFileService.upload(id, berkasId, file);
  }

  @Delete(':id/berkas/:berkasId/file')
  @Permissions('rekomtek.berkas')
  @ApiOperation({ summary: 'Hapus file dari berkas' })
  deleteFile(@Param('id') id: string, @Param('berkasId') berkasId: string) {
    return this.berkasFileService.delete(id, berkasId);
  }
}
