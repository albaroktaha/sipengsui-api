import { BadRequestException } from '@nestjs/common';
import { RekomtekStatus } from '@prisma/client';
import { RekomtekService } from './rekomtek.service';

describe('RekomtekService', () => {
  const prisma = {
    rekomtek: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    rekomtekBerkas: {
      findMany: jest.fn(),
    },
  } as never;
  const berkasService = {} as never;
  const service = new RekomtekService(prisma as never, berkasService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks review submission when a required checklist item has no Drive link', async () => {
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue({
      id: 'rekomtek-1',
      createdById: 'user-1',
      status: RekomtekStatus.DRAFT,
    });
    (prisma.rekomtekBerkas.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'berkas-1',
        kode: '1',
        uraian: 'Surat permohonan',
        driveUrl: null,
      },
    ]);

    await expect(
      service.submit('rekomtek-1', {
        userId: 'user-1',
        role: 'USER',
        roles: ['USER'],
        permissions: [],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        missingBerkas: [{ id: 'berkas-1', kode: '1', uraian: 'Surat permohonan' }],
      }),
    });

    expect(prisma.rekomtek.update).not.toHaveBeenCalled();
  });

  it('allows a PETUGAS to access another user\'s recommendation', async () => {
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

  it('allows a returned recommendation to be submitted again after its links are fixed', async () => {
    (prisma.rekomtek.findUnique as jest.Mock).mockResolvedValue({
      id: 'rekomtek-1',
      createdById: 'user-1',
      status: RekomtekStatus.REJECTED,
    });
    (prisma.rekomtekBerkas.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'berkas-1',
        kode: '1',
        uraian: 'Surat permohonan',
        driveUrl: 'https://drive.google.com/file/d/fixed/view',
      },
    ]);
    (prisma.rekomtek.update as jest.Mock).mockResolvedValue({
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
});
