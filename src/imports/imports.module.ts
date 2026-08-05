import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ImportsController } from './imports.controller';

import { ImportPreviewService } from './services/import-preview.service';
import { ImportUploadService } from './services/import-upload.service';
import { ImportSaveService } from './services/import-save.service';
import { ImportObservationService } from './services/import-observation.service';

@Module({
  imports: [PrismaModule],

  controllers: [ImportsController],

  providers: [
    ImportPreviewService,
    ImportUploadService,
    ImportSaveService,
    ImportObservationService,
  ],

  exports: [ImportUploadService],
})
export class ImportsModule {}
