import { Injectable, BadRequestException } from '@nestjs/common';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';

const ALLOWED_MIMES = [
  // Gambar
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
];

const MAX_SIZE = 30 * 1024 * 1024; // 30MB per file

@Injectable()
export class DisasterReportFileService {
  private uploadDir: string;

  constructor() {
    this.uploadDir = join(process.cwd(), 'uploads', 'disaster-reports');
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async save(
    file: Express.Multer.File,
  ): Promise<{ url: string; name: string; size: number; type: string }> {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipe file tidak diizinkan. Gunakan: JPG, PNG, WEBP, GIF, MP4, WEBM, MOV',
      );
    }

    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Ukuran file maksimal 30MB');
    }

    const ext = extname(file.originalname) || '.bin';
    const safeName = `${randomUUID()}${ext}`;
    const filePath = join(this.uploadDir, safeName);
    await writeFile(filePath, file.buffer);

    return {
      url: `/uploads/disaster-reports/${safeName}`,
      name: file.originalname,
      size: file.size,
      type: file.mimetype,
    };
  }
}
