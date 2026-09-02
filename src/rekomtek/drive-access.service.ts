import { Injectable } from '@nestjs/common';
import {
  buildResourceKeyHeader,
  parseGoogleDriveResource,
  type GoogleDriveResource,
} from './drive-resource.util';

export type DriveTechnicalStatus = 'VALID' | 'INVALID' | 'PENDING_CHECK';

export interface DriveValidationPolicy {
  allowedMimeTypes?: string[];
  maxFileSize?: number | null;
  allowedExportFormats?: string[];
}

export interface DriveValidationResult {
  status: DriveTechnicalStatus;
  code: string;
  message: string;
  storageKey?: string;
  mimeType?: string;
  size?: number;
}

const DEFAULT_MAX_FILE_SIZE = Number(
  process.env.REKOMTEK_DEFAULT_MAX_FILE_SIZE_BYTES ?? 10 * 1024 * 1024,
);
const DEFAULT_EXPORT_FORMAT = 'pdf';
const MAX_SAMPLE_BYTES = 128 * 1024;
const MAX_REDIRECTS = 3;
const REDIRECT_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com',
]);

class DrivePermissionRedirectError extends Error {
  constructor() {
    super('Google Drive meminta autentikasi pengguna');
    this.name = 'DrivePermissionRedirectError';
  }
}

class DriveUnsafeRedirectError extends Error {
  constructor() {
    super('Google Drive mengarahkan ke host yang tidak diizinkan');
    this.name = 'DriveUnsafeRedirectError';
  }
}

function isSafeRedirectHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return REDIRECT_HOSTS.has(lower) || lower.endsWith('.googleusercontent.com');
}

function normalizeMimeType(value: string | null): string {
  return (value ?? '').split(';', 1)[0].trim().toLowerCase();
}

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

function sniffMimeType(sample: Buffer): string | null {
  if (sample.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (
    sample.length >= 3 &&
    sample[0] === 0xff &&
    sample[1] === 0xd8 &&
    sample[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    sample
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    sample.subarray(0, 4).toString('ascii') === 'RIFF' &&
    sample.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function codeForHttpStatus(status: number): string {
  if (status === 401 || status === 403) return 'DRIVE_PERMISSION_REQUIRED';
  if (status === 404 || status === 410) return 'FILE_NOT_FOUND';
  return 'DRIVE_UNREACHABLE';
}

function messageForCode(code: string): string {
  switch (code) {
    case 'DRIVE_PERMISSION_REQUIRED':
      return 'Berkas tidak dapat diakses tanpa permintaan izin. Ubah sharing Google Drive menjadi Anyone with the link — Viewer.';
    case 'FILE_NOT_FOUND':
      return 'Berkas Google Drive tidak ditemukan atau sudah dihapus.';
    case 'FILE_TYPE_NOT_ALLOWED':
      return 'Tipe berkas Google Drive tidak diizinkan untuk persyaratan ini.';
    case 'FILE_SIZE_EXCEEDED':
      return 'Ukuran berkas Google Drive melebihi batas persyaratan.';
    case 'DRIVE_RESPONSE_AMBIGUOUS':
      return 'Google Drive mengembalikan respons yang belum dapat dipastikan. Coba validasi lagi.';
    case 'RESOURCE_NOT_SINGLE_FILE':
      return 'Link harus mengarah ke satu file, bukan folder atau shortcut.';
    case 'EXPORT_FORMAT_NOT_ALLOWED':
      return 'Format export Google Workspace belum dikonfigurasi untuk persyaratan ini.';
    case 'DRIVE_REDIRECT_UNSAFE':
      return 'Link Google Drive mengarah ke tujuan yang tidak diizinkan.';
    case 'INVALID_DRIVE_URL':
      return 'Link harus mengarah ke satu file Google Drive atau Google Workspace yang valid.';
    default:
      return 'Berkas belum dapat diperiksa karena gangguan sementara. Coba lagi.';
  }
}

async function readSample(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (total < maxBytes) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      const remaining = maxBytes - total;
      const accepted = chunk.subarray(0, remaining);
      chunks.push(accepted);
      total += accepted.length;
      if (accepted.length < chunk.length) {
        void reader.cancel().catch(() => undefined);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}

@Injectable()
export class DriveAccessValidator {
  async validate(
    value: string | null | undefined,
    policy: DriveValidationPolicy = {},
  ): Promise<DriveValidationResult> {
    const resource = parseGoogleDriveResource(value);
    if (!resource) {
      return this.invalid('INVALID_DRIVE_URL');
    }

    const target = this.buildProbeUrl(resource, policy);
    if (!target) return this.invalid('EXPORT_FORMAT_NOT_ALLOWED');

    const headers: Record<string, string> = { Accept: '*/*' };
    const resourceKeyHeader = buildResourceKeyHeader(resource);
    if (resourceKeyHeader) {
      headers['X-Goog-Drive-Resource-Keys'] = resourceKeyHeader;
    }

    let response: Response;
    try {
      response = await this.fetchSafely(target, headers);
    } catch (error) {
      if (error instanceof DrivePermissionRedirectError) {
        return this.invalid('DRIVE_PERMISSION_REQUIRED');
      }
      if (error instanceof DriveUnsafeRedirectError) {
        return this.invalid('DRIVE_REDIRECT_UNSAFE');
      }
      return this.pending('DRIVE_UNREACHABLE');
    }

    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 410
    ) {
      return this.invalid(codeForHttpStatus(response.status));
    }
    if (response.status === 429 || response.status >= 500) {
      return this.pending('DRIVE_UNREACHABLE');
    }
    if (!response.ok) {
      return this.pending('DRIVE_UNREACHABLE');
    }

    let mimeType = normalizeMimeType(response.headers.get('content-type'));
    const contentLength = Number(response.headers.get('content-length'));
    const maxFileSize = policy.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

    if (
      mimeType === 'application/octet-stream' ||
      mimeType === 'application/binary'
    ) {
      const detectedMimeType = sniffMimeType(
        await readSample(response.clone(), MAX_SAMPLE_BYTES),
      );
      if (detectedMimeType) mimeType = detectedMimeType;
    }

    if (
      mimeType === 'text/html' ||
      mimeType === 'application/xhtml+xml' ||
      !mimeType
    ) {
      const sample = (await readSample(response, MAX_SAMPLE_BYTES)).toString(
        'utf8',
      );
      if (
        /you need access|request access|sign in|permission required|access denied/i.test(
          sample,
        )
      ) {
        return this.invalid('DRIVE_PERMISSION_REQUIRED');
      }
      return this.pending('DRIVE_RESPONSE_AMBIGUOUS');
    }

    if (!mimeAllowed(mimeType, policy.allowedMimeTypes ?? [])) {
      return this.invalid('FILE_TYPE_NOT_ALLOWED', { mimeType });
    }

    if (Number.isFinite(contentLength) && contentLength > maxFileSize) {
      return this.invalid('FILE_SIZE_EXCEEDED', {
        mimeType,
        size: contentLength,
      });
    }

    if (!Number.isFinite(contentLength)) {
      const sample = await readSample(response, maxFileSize + 1);
      if (sample.length > maxFileSize) {
        return this.invalid('FILE_SIZE_EXCEEDED', {
          mimeType,
          size: sample.length,
        });
      }
    }

    return {
      status: 'VALID',
      code: 'ACCESSIBLE',
      message: 'Berkas dapat diakses dan memenuhi aturan persyaratan.',
      mimeType,
      ...(Number.isFinite(contentLength) ? { size: contentLength } : {}),
    };
  }

  private async fetchSafely(
    url: string,
    headers: Record<string, string>,
  ): Promise<Response> {
    let currentUrl = url;
    const timeoutMs = Number(process.env.REKOMTEK_DRIVE_TIMEOUT_MS ?? 10000);

    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch(currentUrl, {
          headers,
          redirect: 'manual',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (response.status < 300 || response.status >= 400) return response;
      if (attempt === MAX_REDIRECTS) return response;

      const location = response.headers.get('location');
      if (!location) return response;
      const nextUrl = new URL(location, currentUrl);
      if (
        nextUrl.protocol !== 'https:' ||
        !isSafeRedirectHost(nextUrl.hostname)
      ) {
        if (nextUrl.hostname.toLowerCase() === 'accounts.google.com') {
          throw new DrivePermissionRedirectError();
        }
        throw new DriveUnsafeRedirectError();
      }
      currentUrl = nextUrl.toString();
    }

    throw new Error('Too many redirects');
  }

  private buildProbeUrl(
    resource: GoogleDriveResource,
    policy: DriveValidationPolicy,
  ): string | null {
    if (resource.kind === 'BLOB') {
      const url = new URL('https://drive.google.com/uc');
      url.searchParams.set('export', 'download');
      url.searchParams.set('id', resource.fileId);
      if (resource.resourceKey)
        url.searchParams.set('resourcekey', resource.resourceKey);
      return url.toString();
    }

    const format = policy.allowedExportFormats?.[0] ?? DEFAULT_EXPORT_FORMAT;
    if (!format) return null;

    const base =
      resource.kind === 'DOCUMENT'
        ? `https://docs.google.com/document/d/${resource.fileId}/export`
        : resource.kind === 'SHEET'
          ? `https://docs.google.com/spreadsheets/d/${resource.fileId}/export`
          : `https://docs.google.com/presentation/d/${resource.fileId}/export`;
    const url = new URL(base);
    url.searchParams.set('format', format);
    if (resource.resourceKey)
      url.searchParams.set('resourcekey', resource.resourceKey);
    return url.toString();
  }

  private invalid(
    code: string,
    details: Pick<DriveValidationResult, 'mimeType' | 'size'> = {},
  ): DriveValidationResult {
    return {
      status: 'INVALID',
      code,
      message: messageForCode(code),
      ...details,
    };
  }

  private pending(code: string): DriveValidationResult {
    return { status: 'PENDING_CHECK', code, message: messageForCode(code) };
  }
}
