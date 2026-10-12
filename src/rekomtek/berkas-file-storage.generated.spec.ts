import { BadRequestException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BerkasFileStorageService } from './berkas-file-storage.service';

describe('generated rejection-letter PDF storage', () => {
  let root: string;
  let previousRoot: string | undefined;

  beforeEach(async () => {
    previousRoot = process.env.REKOMTEK_BERKAS_STORAGE_DIR;
    root = await mkdtemp(join(tmpdir(), 'rejection-letter-storage-'));
    process.env.REKOMTEK_BERKAS_STORAGE_DIR = root;
  });

  afterEach(async () => {
    if (previousRoot === undefined) {
      delete process.env.REKOMTEK_BERKAS_STORAGE_DIR;
    } else {
      process.env.REKOMTEK_BERKAS_STORAGE_DIR = previousRoot;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('stores only valid generated PDFs under a generated storage key', async () => {
    const service = new BerkasFileStorageService();
    const pdf = Buffer.from('%PDF-1.7\ninternal preview\n%%EOF');

    const key = await service.storeGeneratedPdf(pdf);

    expect(key).toMatch(/^generated\/[0-9a-f-]+\.pdf$/i);
    await expect(service.readBuffer(key)).resolves.toEqual(pdf);
  });

  it('rejects non-PDF buffers instead of storing them', async () => {
    const service = new BerkasFileStorageService();

    await expect(
      service.storeGeneratedPdf(Buffer.from('not a pdf')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
