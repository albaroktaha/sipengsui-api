/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RekomtekStatus } from '@prisma/client';
import { RekomtekService } from './rekomtek.service';

describe('RekomtekService.reapply', () => {
  it('creates an immutable linked revision and carries sources into a fresh draft', async () => {
    const tx = {
      rekomtek: {
        create: jest.fn().mockResolvedValue({ id: 'rekomtek-2' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'rekomtek-2',
          status: RekomtekStatus.DRAFT,
          revisionNumber: 2,
        }),
      },
      rekomtekBerkas: {
        create: jest.fn().mockResolvedValue({ id: 'berkas-2' }),
      },
      rekomtekBerkasLinkHistory: {
        create: jest.fn(),
      },
      rekomtekWorkflowEvent: {
        create: jest.fn(),
      },
    };
    const prisma = {
      rekomtek: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'rekomtek-1',
            createdById: 'user-1',
            status: RekomtekStatus.REJECTED,
          })
          .mockResolvedValueOnce({
            id: 'rekomtek-1',
            nomor: 'REK-001',
            judul: 'Pengajuan awal',
            jenis: 'APU',
            deskripsi: null,
            status: RekomtekStatus.REJECTED,
            jenisPermohonan: 'IZIN_BARU',
            stationId: null,
            riverId: null,
            customRiverName: null,
            watershedId: null,
            riverRegionId: null,
            analysisData: null,
            parameters: null,
            createdBy: 'Pemohon',
            createdById: 'user-1',
            revisionNumber: 1,
            berkas: [
              {
                id: 'berkas-1',
                templateId: 'template-1',
                kode: '1',
                nomorUrut: 1,
                uraian: 'Surat permohonan',
                isRequired: true,
                sourceType: 'GOOGLE_DRIVE',
                driveUrl: 'https://drive.google.com/file/d/file-1/view',
                storageKey: null,
                sourceVersion: 1,
                allowedSourceTypes: ['GOOGLE_DRIVE'],
                sensitivity: 'ORDINARY',
                accessPolicy: 'DRIVE_PUBLIC_ONLY',
                allowedMimeTypes: ['application/pdf'],
                maxFileSize: 1024,
                allowedExportFormats: ['pdf'],
              },
            ],
          })
          .mockResolvedValueOnce(null),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const berkasService = {} as never;
    const service = new RekomtekService(prisma as never, berkasService);

    await expect(
      service.reapply('rekomtek-1', {
        userId: 'user-1',
        role: 'USER',
        roles: ['USER'],
        permissions: ['rekomtek.submit'],
      }),
    ).resolves.toMatchObject({
      id: 'rekomtek-2',
      status: RekomtekStatus.DRAFT,
    });

    expect(tx.rekomtek.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentRekomtekId: 'rekomtek-1',
        revisionNumber: 2,
        status: RekomtekStatus.DRAFT,
        nomor: 'REK-001-R2',
      }),
    });
    expect(tx.rekomtekBerkas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rekomtekId: 'rekomtek-2',
        sourceType: 'GOOGLE_DRIVE',
        technicalStatus: 'PENDING_CHECK',
      }),
    });
    expect(tx.rekomtekBerkasLinkHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ changeReason: 'CARRIED_FORWARD' }),
    });
  });
});
