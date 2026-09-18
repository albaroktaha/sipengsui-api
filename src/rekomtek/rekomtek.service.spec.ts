/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unnecessary-type-assertion */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RekomtekStatus } from '@prisma/client';
import { RekomtekService } from './rekomtek.service';

describe('RekomtekService', () => {
  const prisma = {
    rekomtek: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      delete: jest.fn(),
    },
    rekomtekBerkas: {
      findMany: jest.fn(),
    },
    rekomtekWorkflowEvent: {
      create: jest.fn(),
    },
  } as never;
  const berkasService = {
    generateFromTemplate: jest.fn(),
    revalidateRequired: jest.fn(),
    assertReadyForApproval: jest.fn(),
  };
  const service = new RekomtekService(prisma as never, berkasService as never);

  beforeEach(() => {
    jest.clearAllMocks();
    berkasService.revalidateRequired.mockResolvedValue({
      issues: [],
      incomplete: [],
    });
  });

  it('blocks review submission when a required checklist item has no Drive link', async () => {
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue({
      id: 'rekomtek-1',
      createdById: 'user-1',
      status: RekomtekStatus.DRAFT,
      sourceRevision: 0,
      checklistRevision: 0,
    });
    (prisma.rekomtekBerkas.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'berkas-1',
        kode: '1',
        uraian: 'Surat permohonan',
        driveUrl: null,
      },
    ]);
    berkasService.revalidateRequired.mockResolvedValue({
      issues: [
        {
          id: 'berkas-1',
          kode: '1',
          uraian: 'Surat permohonan',
          status: 'INVALID',
          code: 'SOURCE_REQUIRED',
          message: 'Berkas wajib memiliki sumber',
        },
      ],
      incomplete: [],
    });

    await expect(
      service.submit('rekomtek-1', {
        userId: 'user-1',
        role: 'USER',
        roles: ['USER'],
        permissions: [],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        berkasIssues: [
          expect.objectContaining({ id: 'berkas-1', code: 'SOURCE_REQUIRED' }),
        ],
      }),
    });

    expect(prisma.rekomtek.update).not.toHaveBeenCalled();
  });

  it("allows a PETUGAS to access another user's recommendation", async () => {
    const rekomtek = { id: 'rekomtek-1', createdById: 'user-1' };
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue(rekomtek);

    await expect(
      service.findOne('rekomtek-1', {
        userId: 'staff-1',
        role: 'PETUGAS',
        roles: ['PETUGAS'],
        permissions: ['rekomtek.read'],
      }),
    ).resolves.toEqual(rekomtek);
  });

  it('blocks a PETUGAS-only account from creating a recommendation', async () => {
    await expect(
      service.create(
        { nomor: 'REK-TEST-001' } as never,
        {
          userId: 'petugas-1',
          role: 'PETUGAS',
          roles: ['PETUGAS'],
          permissions: ['rekomtek.create'],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.rekomtek.findUnique).not.toHaveBeenCalled();
  });

  it('allows a returned recommendation to be submitted again after its links are fixed', async () => {
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue({
      id: 'rekomtek-1',
      createdById: 'user-1',
      status: RekomtekStatus.DRAFT,
      sourceRevision: 0,
      checklistRevision: 0,
    });
    (prisma.rekomtekBerkas.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'berkas-1',
        kode: '1',
        uraian: 'Surat permohonan',
        driveUrl: 'https://drive.google.com/file/d/fixed/view',
      },
    ]);
    (prisma.rekomtek.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'rekomtek-1',
        createdById: 'user-1',
        status: RekomtekStatus.DRAFT,
        sourceRevision: 0,
        checklistRevision: 0,
      })
      .mockResolvedValueOnce({
        id: 'rekomtek-1',
        status: RekomtekStatus.REVIEW,
      });

    await expect(
      service.submit('rekomtek-1', {
        userId: 'user-1',
        role: 'USER',
        roles: ['USER'],
        permissions: [],
      }),
    ).resolves.toMatchObject({ status: RekomtekStatus.REVIEW });
  });

  it('blocks approval when required checklist validation is incomplete', async () => {
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue({
      id: 'rekomtek-1',
      createdById: 'user-1',
      status: RekomtekStatus.REVIEW,
    });
    berkasService.assertReadyForApproval.mockRejectedValue(
      new BadRequestException({
        berkasIssues: [{ id: 'berkas-1', code: 'DRIVE_PERMISSION_REQUIRED' }],
      }),
    );

    await expect(
      service.approve('rekomtek-1', 'spoofed-reviewer', {
        userId: 'staff-1',
        role: 'PETUGAS',
        roles: ['PETUGAS'],
        permissions: ['rekomtek.approve'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.rekomtek.update).not.toHaveBeenCalled();
  });

  it('allows a Petugas to edit the recommendation when permitted', async () => {
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue({
      id: 'rekomtek-1',
      createdById: 'owner-1',
      status: RekomtekStatus.DRAFT,
    });

    await expect(
      service.update(
        'rekomtek-1',
        {},
        {
          userId: 'petugas-1',
          role: 'PETUGAS',
          roles: ['PETUGAS'],
          permissions: ['rekomtek.update'],
        },
      ),
    ).resolves.toBeUndefined();
    expect(prisma.rekomtek.update).toHaveBeenCalled();
  });

  it('blocks a Petugas from submitting the recommendation', async () => {
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue({
      id: 'rekomtek-1',
      createdById: 'owner-1',
      status: RekomtekStatus.DRAFT,
    });

    await expect(
      service.submit('rekomtek-1', {
        userId: 'petugas-1',
        role: 'PETUGAS',
        roles: ['PETUGAS'],
        permissions: ['rekomtek.submit'],
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(berkasService.revalidateRequired).not.toHaveBeenCalled();
  });

  it('allows a Petugas to delete the recommendation when permitted', async () => {
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue({
      id: 'rekomtek-1',
      createdById: 'owner-1',
      status: RekomtekStatus.DRAFT,
    });

    await expect(
      service.remove('rekomtek-1', {
        userId: 'petugas-1',
        role: 'PETUGAS',
        roles: ['PETUGAS'],
        permissions: ['rekomtek.delete'],
      }),
    ).resolves.toBeUndefined();
    expect(prisma.rekomtek.delete).toHaveBeenCalled();
  });

  it('removes the new recommendation when checklist generation fails', async () => {
    prisma.rekomtek.findUnique.mockResolvedValueOnce(null);
    prisma.rekomtek.create.mockResolvedValue({ id: 'rekomtek-1' });
    berkasService.generateFromTemplate.mockRejectedValue(
      new BadRequestException(
        'Template checklist belum tersedia untuk GALIAN_C / IZIN_BARU',
      ),
    );

    await expect(
      service.create(
        {
          nomor: 'RKT/NEW/2026',
          judul: 'Galian C Baru',
          jenis: 'GALIAN_C',
          jenisPermohonan: 'IZIN_BARU',
          createdBy: 'Pemohon Contoh',
        } as never,
        { userId: 'user-1', role: 'USER', roles: ['USER'], permissions: [] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.rekomtek.delete).toHaveBeenCalledWith({
      where: { id: 'rekomtek-1' },
    });
  });

  it('passes the Galian C new-permit selection to checklist generation', async () => {
    prisma.rekomtek.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'rekomtek-1', berkas: [] });
    prisma.rekomtek.create.mockResolvedValue({ id: 'rekomtek-1' });
    berkasService.generateFromTemplate.mockResolvedValue(21);

    await service.create(
      {
        nomor: 'RKT/GALIAN/2026',
        judul: 'Galian C Baru',
        jenis: 'GALIAN_C',
        jenisPermohonan: 'IZIN_BARU',
        createdBy: 'Pemohon Contoh',
      } as never,
      { userId: 'user-1', role: 'USER', roles: ['USER'], permissions: [] },
    );

    expect(berkasService.generateFromTemplate).toHaveBeenCalledWith(
      'rekomtek-1',
      'GALIAN_C',
      'IZIN_BARU',
    );
  });
});
