import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BerkasFileStorageService,
  validateBerkasFileSignature,
} from './berkas-file-storage.service';

describe('validateBerkasFileSignature', () => {
  it('accepts a PDF signature for a PDF declaration', () => {
    expect(
      validateBerkasFileSignature(Buffer.from('%PDF-1.7\n'), 'application/pdf'),
    ).toBe(true);
  });

  it('accepts an Office zip container for an Office declaration', () => {
    expect(
      validateBerkasFileSignature(
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
  });

  it('rejects a declared PDF when the bytes are an executable signature', () => {
    expect(
      validateBerkasFileSignature(
        Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
        'application/pdf',
      ),
    ).toBe(false);
  });

  it('stores a structurally valid upload in quarantine until antivirus is configured', async () => {
    const root = join(tmpdir(), `sipengsui-berkas-${randomUUID()}`);
    const previousRoot = process.env.REKOMTEK_BERKAS_STORAGE_DIR;
    const previousScanner = process.env.REKOMTEK_ANTIVIRUS_COMMAND;
    process.env.REKOMTEK_BERKAS_STORAGE_DIR = root;
    delete process.env.REKOMTEK_ANTIVIRUS_COMMAND;

    try {
      const service = new BerkasFileStorageService();
      const result = await service.stage(
        {
          buffer: Buffer.from('%PDF-1.7\n'),
          mimetype: 'application/pdf',
          size: 9,
          originalname: 'persyaratan.pdf',
        } as Express.Multer.File,
        { allowedMimeTypes: ['application/pdf'], maxFileSize: 1024 },
      );

      expect(result).toMatchObject({
        technicalStatus: 'PENDING_CHECK',
        technicalCode: 'ANTIVIRUS_NOT_CONFIGURED',
      });
      await expect(service.exists(result.storageKey)).resolves.toBe(true);
      await expect(
        service.revalidate(result.storageKey),
      ).resolves.toMatchObject({
        storageKey: result.storageKey,
        technicalStatus: 'PENDING_CHECK',
      });
      await service.remove(result.storageKey);
    } finally {
      if (previousRoot === undefined)
        delete process.env.REKOMTEK_BERKAS_STORAGE_DIR;
      else process.env.REKOMTEK_BERKAS_STORAGE_DIR = previousRoot;
      if (previousScanner === undefined)
        delete process.env.REKOMTEK_ANTIVIRUS_COMMAND;
      else process.env.REKOMTEK_ANTIVIRUS_COMMAND = previousScanner;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('treats a numeric antivirus exit code 1 as malware', async () => {
    const root = join(tmpdir(), `sipengsui-berkas-${randomUUID()}`);
    const previousRoot = process.env.REKOMTEK_BERKAS_STORAGE_DIR;
    const previousScanner = process.env.REKOMTEK_ANTIVIRUS_COMMAND;
    process.env.REKOMTEK_BERKAS_STORAGE_DIR = root;
    process.env.REKOMTEK_ANTIVIRUS_COMMAND = process.execPath;

    try {
      const service = new BerkasFileStorageService();
      const result = await service.stage(
        {
          buffer: Buffer.from('%PDF-1.7\n'),
          mimetype: 'application/pdf',
          size: 9,
          originalname: 'malware-fixture.pdf',
        } as Express.Multer.File,
        { allowedMimeTypes: ['application/pdf'], maxFileSize: 1024 },
      );

      expect(result).toMatchObject({
        technicalStatus: 'INVALID',
        technicalCode: 'MALWARE_DETECTED',
      });
      await expect(service.exists(result.storageKey)).resolves.toBe(false);
    } finally {
      if (previousRoot === undefined)
        delete process.env.REKOMTEK_BERKAS_STORAGE_DIR;
      else process.env.REKOMTEK_BERKAS_STORAGE_DIR = previousRoot;
      if (previousScanner === undefined)
        delete process.env.REKOMTEK_ANTIVIRUS_COMMAND;
      else process.env.REKOMTEK_ANTIVIRUS_COMMAND = previousScanner;
      await rm(root, { recursive: true, force: true });
    }
  });
});
