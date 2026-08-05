import { Injectable } from '@nestjs/common';

import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

import { ImportPreviewService } from './import-preview.service';

@Injectable()
export class ImportUploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previewService: ImportPreviewService,
  ) {}

  async upload(file: Express.Multer.File) {
    const preview = this.previewService.preview(file);

    const draft = await this.prisma.importDraft.create({
      data: {
        filename: preview.filename,

        importType: preview.importType,

        metadata: preview.metadata as unknown as Prisma.InputJsonValue,

        rows: preview.rows as unknown as Prisma.InputJsonValue,

        summary: preview.summary as unknown as Prisma.InputJsonValue,

        createdBy: 'Administrator',

        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    return {
      draftId: draft.id,

      importType: preview.importType,

      filename: preview.filename,

      metadata: preview.metadata,

      summary: preview.summary,

      rows: preview.rows,
    };
  }
}
