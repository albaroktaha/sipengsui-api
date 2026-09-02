/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { BerkasService } from './berkas.service';
import { BadRequestException } from '@nestjs/common';

describe('BerkasService source validation', () => {
  it('keeps an inaccessible Drive link as an invalid draft and records the source change', async () => {
    const prisma = {
      rekomtekBerkas: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'berkas-1',
          sourceType: null,
          driveUrl: null,
          storageKey: null,
          sourceVersion: 0,
          allowedSourceTypes: ['GOOGLE_DRIVE'],
          sensitivity: 'ORDINARY',
          accessPolicy: 'DRIVE_PUBLIC_ONLY',
          allowedMimeTypes: ['application/pdf'],
          maxFileSize: 1024,
          allowedExportFormats: ['pdf'],
          rekomtek: {
            status: 'DRAFT',
            createdById: 'user-1',
            sourceRevision: 0,
            checklistRevision: 0,
          },
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'berkas-1',
          sourceType: 'GOOGLE_DRIVE',
          driveUrl: 'https://drive.google.com/file/d/private-1/view',
          technicalStatus: 'INVALID',
          technicalCode: 'DRIVE_PERMISSION_REQUIRED',
        }),
      },
      rekomtekBerkasLinkHistory: { create: jest.fn() },
      rekomtek: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    const validator = {
      validate: jest.fn().mockResolvedValue({
        status: 'INVALID',
        code: 'DRIVE_PERMISSION_REQUIRED',
        message: 'Berkas membutuhkan permission',
      }),
    };

    const service = new BerkasService(prisma as never, validator as never);

    await expect(
      service.update(
        'rekomtek-1',
        'berkas-1',
        { driveUrl: 'https://drive.google.com/file/d/private-1/view' },
        { userId: 'user-1', role: 'USER', roles: ['USER'], permissions: [] },
      ),
    ).resolves.toMatchObject({ technicalStatus: 'INVALID' });

    expect(prisma.rekomtekBerkas.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'GOOGLE_DRIVE',
          technicalStatus: 'INVALID',
          technicalCode: 'DRIVE_PERMISSION_REQUIRED',
          isComplete: false,
          reviewStatus: 'PENDING',
        }),
      }),
    );
    expect(prisma.rekomtekBerkasLinkHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        oldSourceType: null,
        newSourceType: 'GOOGLE_DRIVE',
        oldDriveUrl: null,
        newDriveUrl: 'https://drive.google.com/file/d/private-1/view',
      }),
    });
  });

  it('rejects private upload for a Google Drive-only checklist item', async () => {
    const prisma = {
      rekomtekBerkas: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'berkas-sensitive',
          sourceType: null,
          driveUrl: null,
          storageKey: null,
          sourceVersion: 0,
          allowedSourceTypes: ['GOOGLE_DRIVE'],
          sensitivity: 'SENSITIVE',
          accessPolicy: 'DRIVE_PUBLIC_ONLY',
          allowedMimeTypes: ['application/pdf'],
          maxFileSize: 1024,
          allowedExportFormats: ['pdf'],
          rekomtek: {
            status: 'DRAFT',
            createdById: 'user-1',
            sourceRevision: 0,
            checklistRevision: 0,
          },
        }),
      },
    };
    const validator = { validate: jest.fn() };
    const service = new BerkasService(prisma as never, validator as never);

    await expect(
      service.update(
        'rekomtek-1',
        'berkas-sensitive',
        {
          sourceType: 'UPLOAD',
          driveUrl: 'https://drive.google.com/file/d/sensitive/view',
        },
        { userId: 'user-1', role: 'USER', roles: ['USER'], permissions: [] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(validator.validate).not.toHaveBeenCalled();
  });
});
