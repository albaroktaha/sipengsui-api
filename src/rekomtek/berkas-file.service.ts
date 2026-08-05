import { Injectable, BadRequestException } from '@nestjs/common';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class BerkasFileService {
  private uploadDir: string;

  constructor(private readonly prisma: PrismaService) {
    this.uploadDir = join(process.cwd(), 'uploads', 'rekomtek-berkas');
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(
    rekomtekId: string,
    berkasId: string,
    file: Express.Multer.File,
  ): Promise<{ fileUrl: string; fileName: string; fileSize: number }> {
    // Validasi keberadaan berkas
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
    });
    if (!berkas) {
      throw new BadRequestException('Berkas tidak ditemukan');
    }

    // Validasi tipe file
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Tipe file tidak diizinkan. Gunakan: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX',
      );
    }

    // Validasi ukuran
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('Ukuran file maksimal 10MB');
    }

    // Hapus file lama jika ada
    if (berkas.fileUrl) {
      await this.deleteFile(berkas.fileUrl).catch(() => {});
    }

    // Simpan file baru
    const ext = extname(file.originalname);
    const safeName = `${randomUUID()}${ext}`;
    const filePath = join(this.uploadDir, safeName);
    await writeFile(filePath, file.buffer);

    const fileUrl = `/uploads/rekomtek-berkas/${safeName}`;

    await this.prisma.rekomtekBerkas.update({
      where: { id: berkasId },
      data: {
        fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        // Clear revision flags when user uploads a new file
        revisionNote: null,
        returnedAt: null,
      },
    });

    return {
      fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
    };
  }

  async delete(rekomtekId: string, berkasId: string): Promise<void> {
    const berkas = await this.prisma.rekomtekBerkas.findFirst({
      where: { id: berkasId, rekomtekId },
    });
    if (!berkas) {
      throw new BadRequestException('Berkas tidak ditemukan');
    }

    if (berkas.fileUrl) {
      await this.deleteFile(berkas.fileUrl).catch(() => {});
    }

    await this.prisma.rekomtekBerkas.update({
      where: { id: berkasId },
      data: {
        fileUrl: null,
        fileName: null,
        fileSize: null,
      },
    });
  }

  private async deleteFile(fileUrl: string): Promise<void> {
    const fileName = fileUrl.split('/').pop();
    if (!fileName) return;
    const filePath = join(this.uploadDir, fileName);
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  }
}
