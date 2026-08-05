import {
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { DisasterReportsService } from './disaster-reports.service';
import { DisasterReportFileService } from './disaster-report-file.service';
import { CreateDisasterReportDto } from './dto/create-disaster-report.dto';

/**
 * Endpoint publik untuk Lapor Banjir — tidak butuh login.
 * Flow: upload file(s) dulu → dapat URL → buat laporan dengan URL tsb.
 */
@ApiTags('Disaster Reports (Public)')
@Controller('public/disaster-reports')
export class PublicDisasterReportController {
  constructor(
    private readonly disasterReportsService: DisasterReportsService,
    private readonly fileService: DisasterReportFileService,
  ) {}

  @Post('files')
  @ApiOperation({
    summary: 'Upload gambar/video banjir (maks 5 file, 30MB/file)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 5, { storage: memoryStorage() }))
  async uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      return { files: [] };
    }

    const saved: { url: string; name: string; size: number; type: string }[] =
      [];
    for (const file of files) {
      saved.push(await this.fileService.save(file));
    }

    return { files: saved };
  }

  @Post()
  @ApiOperation({ summary: 'Buat laporan banjir publik (tanpa login)' })
  create(@Body() dto: CreateDisasterReportDto) {
    const judul =
      dto.judul?.trim() ||
      (dto.jenis === 'BANJIR'
        ? 'Laporan Banjir Warga'
        : 'Laporan Bencana Warga');
    return this.disasterReportsService.create({
      ...dto,
      judul,
      userId: null,
    });
  }
}
