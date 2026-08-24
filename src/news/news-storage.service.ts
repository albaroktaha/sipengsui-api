import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface StoredNewsImage {
  key: string;
  url: string;
  contentType: 'image/webp';
  size: number;
}

@Injectable()
export class NewsStorageService {
  private readonly driver = (
    process.env.NEWS_STORAGE_DRIVER ?? 'local'
  ).toLowerCase();
  private s3Client?: S3Client;

  async uploadImage(file: Express.Multer.File): Promise<StoredNewsImage> {
    if (!file?.buffer || !file.mimetype) {
      throw new BadRequestException('File gambar wajib diunggah');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Format gambar harus JPEG, PNG, atau WebP');
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Ukuran gambar maksimal 5 MB');
    }

    let output: Buffer;
    try {
      output = await sharp(file.buffer)
        .rotate()
        .resize({
          width: 1600,
          height: 1200,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException('File bukan gambar yang valid');
    }

    const key = `news/${randomUUID()}.webp`;

    if (this.driver === 's3' || this.driver === 'r2') {
      return this.uploadToS3(key, output);
    }

    return this.uploadToLocal(key, output);
  }

  private async uploadToLocal(
    key: string,
    output: Buffer,
  ): Promise<StoredNewsImage> {
    const absolutePath = join(process.cwd(), 'uploads', key);
    await mkdir(join(process.cwd(), 'uploads', 'news'), { recursive: true });
    await writeFile(absolutePath, output);

    const publicBase = process.env.NEWS_STORAGE_PUBLIC_URL?.replace(/\/$/, '');
    const url = publicBase ? `${publicBase}/uploads/${key}` : `/uploads/${key}`;

    return { key, url, contentType: 'image/webp', size: output.length };
  }

  private async uploadToS3(
    key: string,
    output: Buffer,
  ): Promise<StoredNewsImage> {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION ?? 'auto';
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const publicBase =
      process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '') ??
      process.env.NEWS_STORAGE_PUBLIC_URL?.replace(/\/$/, '');

    if (!bucket || !accessKeyId || !secretAccessKey || !publicBase) {
      throw new InternalServerErrorException(
        'Storage S3/R2 belum dikonfigurasi lengkap. Isi S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, dan S3_PUBLIC_BASE_URL.',
      );
    }

    this.s3Client ??= new S3Client({
      region,
      endpoint,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
    });

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: output,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch {
      throw new InternalServerErrorException(
        'Gagal menyimpan gambar ke object storage',
      );
    }

    return {
      key,
      url: `${publicBase}/${key}`,
      contentType: 'image/webp',
      size: output.length,
    };
  }
}
