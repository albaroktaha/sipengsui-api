/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-type-assertion */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BerkasService } from './berkas.service';

describe('BerkasService', () => {
  const prisma = {
    rekomtekBerkas: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({ id: 'berkas-1' }),
    },
    rekomtekBerkasLinkHistory: {
      create: jest.fn(),
    },
    rekomtek: {
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    rekomtekBerkasTemplate: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  } as never;
  const driveValidator = {
    validate: jest.fn(),
  };

  const service = new BerkasService(prisma as never, driveValidator as never);

  beforeEach(() => {
    jest.clearAllMocks();
    driveValidator.validate.mockResolvedValue({
      status: 'VALID',
      code: 'ACCESSIBLE',
      message: 'Berkas dapat diakses',
    });
  });

  it('rejects notes and verification changes from a non-staff applicant', async () => {
    (prisma.rekomtekBerkas.findFirst as jest.Mock).mockResolvedValue({
      id: 'berkas-1',
      driveUrl: null,
      rekomtek: { status: 'DRAFT', createdById: 'user-1' },
    });

    await expect(
      service.update(
        'rekomtek-1',
        'berkas-1',
        { notes: 'catatan pemohon' },
        { userId: 'user-1', role: 'USER', roles: ['USER'], permissions: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.rekomtekBerkas.update).not.toHaveBeenCalled();
  });

  it('records a Drive link change and lets staff verify the item', async () => {
    const updated = {
      id: 'berkas-1',
      driveUrl: 'https://drive.google.com/file/d/new',
    };
    (prisma.rekomtekBerkas.findFirst as jest.Mock).mockResolvedValue({
      id: 'berkas-1',
      sourceType: 'GOOGLE_DRIVE',
      driveUrl: 'https://drive.google.com/file/d/old',
      storageKey: null,
      allowedSourceTypes: ['GOOGLE_DRIVE'],
      sensitivity: 'ORDINARY',
      accessPolicy: 'DRIVE_PUBLIC_ONLY',
      technicalStatus: 'VALID',
      allowedMimeTypes: null,
      maxFileSize: null,
      allowedExportFormats: null,
      sourceVersion: 0,
      rekomtek: {
        status: 'DRAFT',
        createdById: 'user-1',
        sourceRevision: 0,
        checklistRevision: 0,
      },
    });
    (prisma.rekomtekBerkas.findUnique as jest.Mock).mockResolvedValue(updated);
    (prisma.rekomtekBerkasLinkHistory.create as jest.Mock).mockResolvedValue({
      id: 'history-1',
    });

    await expect(
      service.update(
        'rekomtek-1',
        'berkas-1',
        {
          driveUrl: 'https://drive.google.com/file/d/new',
          isComplete: true,
          notes: 'Sudah diverifikasi',
        },
        {
          userId: 'staff-1',
          role: 'PETUGAS',
          roles: ['PETUGAS'],
          permissions: [],
        },
      ),
    ).resolves.toEqual(updated);

    expect(prisma.rekomtek.updateMany).toHaveBeenCalledWith({
      where: { id: 'rekomtek-1', status: 'DRAFT' },
      data: {
        sourceRevision: { increment: 1 },
        checklistRevision: { increment: 1 },
      },
    });

    expect(prisma.rekomtekBerkasLinkHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rekomtekBerkasId: 'berkas-1',
        oldDriveUrl: 'https://drive.google.com/file/d/old',
        newDriveUrl: 'https://drive.google.com/file/d/new',
        oldSourceType: 'GOOGLE_DRIVE',
        newSourceType: 'GOOGLE_DRIVE',
        changedById: 'staff-1',
        role: 'PETUGAS',
      }),
    });
  });

  it('rejects returning a checklist item for revision from a non-staff applicant', async () => {
    (prisma.rekomtekBerkas.findFirst as jest.Mock).mockResolvedValue({
      id: 'berkas-1',
      rekomtek: { status: 'REVIEW' },
    });

    await expect(
      service.returnForRevision(
        'rekomtek-1',
        'berkas-1',
        { revisionNote: 'Mohon perbaiki link' },
        { userId: 'user-1', role: 'USER', roles: ['USER'], permissions: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks every source mutation on a rejected record, including staff', async () => {
    (prisma.rekomtekBerkas.findFirst as jest.Mock).mockResolvedValue({
      id: 'berkas-rejected',
      sourceType: 'GOOGLE_DRIVE',
      driveUrl: 'https://drive.google.com/file/d/old/view',
      storageKey: null,
      sourceVersion: 1,
      allowedSourceTypes: ['GOOGLE_DRIVE'],
      sensitivity: 'ORDINARY',
      accessPolicy: 'DRIVE_PUBLIC_ONLY',
      allowedMimeTypes: ['application/pdf'],
      maxFileSize: 1024,
      allowedExportFormats: ['pdf'],
      rekomtek: {
        status: 'REJECTED',
        createdById: 'user-1',
        sourceRevision: 0,
        checklistRevision: 0,
      },
    });

    await expect(
      service.update(
        'rekomtek-1',
        'berkas-rejected',
        { driveUrl: 'https://drive.google.com/file/d/new/view' },
        {
          userId: 'staff-1',
          role: 'PETUGAS',
          roles: ['PETUGAS'],
          permissions: [],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not expose a quarantined upload to a reviewer', async () => {
    const storage = { getFile: jest.fn() };
    (prisma.rekomtekBerkas.findFirst as jest.Mock).mockResolvedValue({
      storageKey: 'quarantine/file.pdf',
      sourceType: 'UPLOAD',
      technicalStatus: 'PENDING_CHECK',
    });
    const reviewerService = new BerkasService(
      prisma as never,
      driveValidator as never,
      storage as never,
    );

    await expect(
      reviewerService.getFileForReviewer('rekomtek-1', 'berkas-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.getFile).not.toHaveBeenCalled();
  });

  it('fails clearly instead of creating an empty checklist when no template exists', async () => {
    await expect(
      service.generateFromTemplate(
        'rekomtek-1',
        'GALIAN_C',
        'JENIS_PERMOHONAN_TIDAK_DIDUKUNG',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.rekomtekBerkas.createMany).not.toHaveBeenCalled();
  });

  it('generates the Galian C new-permit checklist from its template', async () => {
    prisma.rekomtekBerkasTemplate.findMany.mockResolvedValue([
      {
        id: 'template-1',
        kode: '1',
        nomorUrut: 1,
        uraian: 'Surat permohonan',
        isRequired: true,
        allowedSourceTypes: ['GOOGLE_DRIVE'],
        sensitivity: 'ORDINARY',
        accessPolicy: 'DRIVE_PUBLIC_ONLY',
        allowedMimeTypes: null,
        maxFileSize: null,
        allowedExportFormats: null,
      },
    ]);

    await expect(
      service.generateFromTemplate('rekomtek-1', 'GALIAN_C', 'IZIN_BARU'),
    ).resolves.toBe(1);

    expect(prisma.rekomtekBerkas.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rekomtekId: 'rekomtek-1',
          templateId: 'template-1',
          kode: '1',
          isComplete: false,
        }),
      ],
    });
  });
});
