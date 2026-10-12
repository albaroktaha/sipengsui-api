import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RejectionLetterApprovalService } from './rejection-letter-approval.service';

@ApiTags('Public rejection-letter verification')
@Controller('rejection-letter-verification')
export class RejectionLetterVerificationController {
  constructor(
    private readonly approvalService: RejectionLetterApprovalService,
  ) {}

  @Get(':token')
  @ApiOperation({
    summary: 'Cek status penerbitan surat tanpa membuka data pribadi pemohon',
  })
  getStatus(@Param('token') token: string) {
    return this.approvalService.getPublicVerification(token);
  }

  @Post(':token/file')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Cocokkan checksum berkas PDF surat dengan catatan verifikasi',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  verifyFile(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.approvalService.verifyPublicFile(
      token,
      file?.buffer ?? Buffer.alloc(0),
    );
  }
}
