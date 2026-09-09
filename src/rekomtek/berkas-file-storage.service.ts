import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

export type StoredFileTechnicalStatus = 'VALID' | 'INVALID' | 'PENDING_CHECK';

export interface BerkasFileStoragePolicy {
  allowedMimeTypes?: string[];
  maxFileSize?: number | null;
}

export interface StoredBerkasFile {
  storageKey: string;
  mimeType: string;
  size: number;
  technicalStatus: StoredFileTechnicalStatus;
  technicalCode: string;
  technicalMessage: string;
}

export interface StoredBerkasValidation {
  storageKey: string;
  technicalStatus: StoredFileTechnicalStatus;
  technicalCode: string;
  technicalMessage: string;
}

const DEFAULT_MAX_FILE_SIZE = Number(
  process.env.REKOMTEK_DEFAULT_MAX_FILE_SIZE_BYTES ?? 10 * 1024 * 1024,
);
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    '.pptx',
};

function mimeAllowed(mimeType: string, allowedMimeTypes: string[]): boolean {
  if (allowedMimeTypes.length === 0) return true;
  return allowedMimeTypes.some((allowed) => {
    const normalized = allowed.toLowerCase();
    return (
      normalized === mimeType ||
      (normalized.endsWith('/*') &&
        mimeType.startsWith(normalized.slice(0, -1)))
    );
  });
}

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((value, index) => buffer[index] === value);
}

function antivirusArguments(absolutePath: string): string[] {
  const configured = process.env.REKOMTEK_ANTIVIRUS_ARGS?.trim();
  if (!configured) return [absolutePath];

  const parsed: unknown = JSON.parse(configured);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((value) => typeof value === 'string')
  ) {
    throw new Error('REKOMTEK_ANTIVIRUS_ARGS wajib berupa JSON array string');
  }
  const hasFilePlaceholder = parsed.includes('{file}');
  const args = parsed.map((value) =>
    value === '{file}' ? absolutePath : value,
  );
  return hasFilePlaceholder ? args : [...args, absolutePath];
}

export function validateBerkasFileSignature(
  buffer: Buffer,
  declaredMimeType: string,
): boolean {
  const mimeType = declaredMimeType.toLowerCase();

  if (mimeType === 'application/pdf') {
    return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (mimeType === 'image/jpeg')
    return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
  if (mimeType === 'image/png') {
    return startsWithBytes(
      buffer,
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType.includes('openxmlformats') || mimeType === 'application/zip') {
    return (
      startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
      startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06])
    );
  }
  if (mimeType === 'text/plain' || mimeType === 'text/csv') {
    return (
      buffer.length > 0 &&
      !buffer.includes(0) &&
      !buffer.toString('utf8').includes('\ufffd')
    );
  }

  return false;
}

@Injectable()
export class BerkasFileStorageService {
  private readonly root = resolve(
    process.env.REKOMTEK_BERKAS_STORAGE_DIR ??
      join(process.cwd(), 'storage', 'rekomtek-berkas'),
  );

  async stage(
    file: Express.Multer.File,
    policy: BerkasFileStoragePolicy = {},
  ): Promise<StoredBerkasFile> {
    if (!file?.buffer || !file.mimetype) {
      throw new BadRequestException('File persyaratan wajib diunggah');
    }

    const mimeType = file.mimetype.toLowerCase();
    const maxFileSize = policy.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const size = file.buffer.length;
    if (size > maxFileSize) {
      throw new BadRequestException('Ukuran file melebihi batas persyaratan');
    }
    if (!mimeAllowed(mimeType, policy.allowedMimeTypes ?? [])) {
      throw new BadRequestException(
        'Tipe file tidak diizinkan untuk persyaratan ini',
      );
    }
    if (!validateBerkasFileSignature(file.buffer, mimeType)) {
      throw new BadRequestException(
        'Isi file tidak sesuai dengan tipe file yang dikirim',
      );
    }

    const extension =
      MIME_EXTENSIONS[mimeType] ??
      extname(file.originalname || '').toLowerCase();
    const storageKey = `quarantine/${randomUUID()}${extension}`;
    const absolutePath = this.resolvePath(storageKey);
    await mkdir(join(this.root, 'quarantine'), { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });

    const scanResult = await this.scan(absolutePath);
    if (scanResult.technicalStatus === 'INVALID') {
      await this.remove(storageKey);
    } else if (scanResult.technicalStatus === 'VALID') {
      const activeKey = storageKey.replace(/^quarantine\//, 'active/');
      await mkdir(join(this.root, 'active'), { recursive: true });
      await rename(absolutePath, this.resolvePath(activeKey));
      return {
        storageKey: activeKey,
        mimeType,
        size,
        ...scanResult,
      };
    }

    return {
      storageKey,
      mimeType,
      size,
      ...scanResult,
    };
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await access(this.resolvePath(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async revalidate(storageKey: string): Promise<StoredBerkasValidation> {
    const absolutePath = this.resolvePath(storageKey);
    if (!(await this.exists(storageKey))) {
      return {
        storageKey,
        technicalStatus: 'INVALID',
        technicalCode: 'FILE_NOT_FOUND',
        technicalMessage:
          'File persyaratan tidak ditemukan di storage aplikasi.',
      };
    }

    const scanResult = await this.scan(absolutePath);
    if (scanResult.technicalStatus === 'INVALID') {
      await this.remove(storageKey);
      return { storageKey, ...scanResult };
    }

    if (
      scanResult.technicalStatus === 'VALID' &&
      storageKey.startsWith('quarantine/')
    ) {
      const activeKey = storageKey.replace(/^quarantine\//, 'active/');
      await mkdir(join(this.root, 'active'), { recursive: true });
      await rename(absolutePath, this.resolvePath(activeKey));
      return { storageKey: activeKey, ...scanResult };
    }

    return { storageKey, ...scanResult };
  }

  async cloneForRevision(storageKey: string): Promise<string | null> {
    if (!(await this.exists(storageKey))) return null;
    const extension = extname(storageKey).toLowerCase();
    const clonedKey = `quarantine/${randomUUID()}${extension}`;
    await mkdir(join(this.root, 'quarantine'), { recursive: true });
    await copyFile(this.resolvePath(storageKey), this.resolvePath(clonedKey));
    return clonedKey;
  }

  async getFile(
    storageKey: string,
  ): Promise<{ stream: NodeJS.ReadableStream; size: number }> {
    const path = this.resolvePath(storageKey);
    try {
      const metadata = await stat(path);
      return { stream: createReadStream(path), size: metadata.size };
    } catch {
      throw new NotFoundException('File persyaratan tidak ditemukan');
    }
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await rm(this.resolvePath(storageKey), { force: true });
    } catch {
      throw new InternalServerErrorException(
        'Gagal menghapus file persyaratan',
      );
    }
  }

  private async scan(
    absolutePath: string,
  ): Promise<
    Pick<
      StoredBerkasFile,
      'technicalStatus' | 'technicalCode' | 'technicalMessage'
    >
  > {
    const command = process.env.REKOMTEK_ANTIVIRUS_COMMAND;
    if (!command) {
      return {
        technicalStatus: 'PENDING_CHECK',
        technicalCode: 'ANTIVIRUS_NOT_CONFIGURED',
        technicalMessage: 'File menunggu antivirus scanner dikonfigurasi.',
      };
    }

    let args: string[];
    try {
      args = antivirusArguments(absolutePath);
    } catch {
      return {
        technicalStatus: 'PENDING_CHECK',
        technicalCode: 'ANTIVIRUS_CONFIG_INVALID',
        technicalMessage: 'Konfigurasi argumen antivirus tidak valid.',
      };
    }

    try {
      await execFileAsync(command, args, {
        timeout: Number(process.env.REKOMTEK_ANTIVIRUS_TIMEOUT_MS ?? 30000),
        windowsHide: true,
      });
      return {
        technicalStatus: 'VALID',
        technicalCode: 'SCAN_CLEAN',
        technicalMessage: 'File lolos pemeriksaan antivirus.',
      };
    } catch (error) {
      const exitCode = (error as { code?: unknown }).code;
      if (exitCode === 1 || exitCode === '1') {
        return {
          technicalStatus: 'INVALID',
          technicalCode: 'MALWARE_DETECTED',
          technicalMessage: 'File ditolak karena terdeteksi tidak aman.',
        };
      }
      return {
        technicalStatus: 'PENDING_CHECK',
        technicalCode:
          exitCode === 'ENOENT'
            ? 'ANTIVIRUS_UNAVAILABLE'
            : 'ANTIVIRUS_SCAN_FAILED',
        technicalMessage: 'Pemeriksaan antivirus belum dapat diselesaikan.',
      };
    }
  }

  private resolvePath(storageKey: string): string {
    const absolute = resolve(this.root, storageKey);
    if (
      absolute !== this.root &&
      !absolute.startsWith(
        `${this.root}${process.platform === 'win32' ? '\\' : '/'}`,
      )
    ) {
      throw new BadRequestException('Storage key file tidak valid');
    }
    return absolute;
  }
}
