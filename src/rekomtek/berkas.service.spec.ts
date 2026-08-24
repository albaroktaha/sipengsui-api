import { ForbiddenException } from '@nestjs/common';
import { BerkasService } from './berkas.service';

describe('BerkasService', () => {
  const prisma = {
    rekomtekBerkas: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    rekomtekBerkasLinkHistory: {
      create: jest.fn(),
    },
    rekomtek: {
      update: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
  } as never;

  const service = new BerkasService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
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
    const updated = { id: 'berkas-1', driveUrl: 'https://drive.google.com/file/d/new' };
    (prisma.rekomtekBerkas.findFirst as jest.Mock).mockResolvedValue({
      id: 'berkas-1',
      driveUrl: 'https://drive.google.com/file/d/old',
      rekomtek: { status: 'REVIEW', createdById: 'user-1' },
    });
    (prisma.rekomtekBerkas.update as jest.Mock).mockResolvedValue(updated);
    (prisma.rekomtekBerkasLinkHistory.create as jest.Mock).mockResolvedValue({
      id: 'history-1',
    });

    await expect(
      service.update(
        'rekomtek-1',
        'berkas-1',
        { driveUrl: 'https://drive.google.com/file/d/new', isComplete: true, notes: 'Sudah diverifikasi' },
        { userId: 'staff-1', role: 'PETUGAS', roles: ['PETUGAS'], permissions: [] },
      ),
    ).resolves.toEqual(updated);

    expect(prisma.rekomtekBerkasLinkHistory.create).toHaveBeenCalledWith({
      data: {
        rekomtekBerkasId: 'berkas-1',
        oldDriveUrl: 'https://drive.google.com/file/d/old',
        newDriveUrl: 'https://drive.google.com/file/d/new',
        changedById: 'staff-1',
        role: 'PETUGAS',
      },
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
});
