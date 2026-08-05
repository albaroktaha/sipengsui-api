import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { ConfirmImportDto } from './dto/confirm-import.dto';

import { ImportUploadService } from './services/import-upload.service';
import { ImportSaveService } from './services/import-save.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Imports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly uploadService: ImportUploadService,
    private readonly saveService: ImportSaveService,
  ) {}

  @Post('upload')
  @Permissions('imports.create')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    return this.uploadService.upload(file);
  }

  @Post('confirm')
  @Permissions('imports.create')
  confirm(
    @Body()
    dto: ConfirmImportDto,
  ) {
    return this.saveService.confirm(dto);
  }
}
