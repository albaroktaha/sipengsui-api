/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BerkasTechnicalStatus,
  RekomtekArtifactStatus,
  RekomtekArtifactType,
  RekomtekExposeStatus,
  RekomtekReviewType,
  RekomtekStatus,
  RekomtekWorkflowStage,
} from '@prisma/client';
import { RekomtekWorkflowService } from './rekomtek-workflow.service';

function actor(
  overrides: Partial<{
    userId: string;
    role: string;
    roles: string[];
    permissions: string[];
  }> = {},
) {
  return {
    userId: 'pokja-1',
    email: 'pokja@example.com',
    role: 'PETUGAS',
    roles: ['PETUGAS'],
    permissions: ['rekomtek.evaluate', 'rekomtek.correct.initial'],
    ...overrides,
  };
}

function record(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rekomtek-1',
    workflowStage: RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL,
    workflowVersion: 4,
    initialCorrectionCount: 0,
    status: RekomtekStatus.REVIEW,
    workflowMigrationRequired: false,
    createdById: 'pemohon-1',
    reviewedBy: null,
    approvedBy: null,
    approvedAt: null,
    approvedDraftArtifactId: null,
    ...overrides,
  };
}

function createFixture() {
  const tx = {
    rekomtek: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'rekomtek-1',
        status: RekomtekStatus.REVIEW,
        nomor: 'RKT/001/2026',
        judul: 'Permohonan APU',
        jenis: 'APU',
        jenisPermohonan: 'IZIN_BARU',
        createdBy: 'pemohon@example.test',
        createdById: 'pemohon-1',
        createdByUser: {
          firstName: 'Siti',
          lastName: 'Aminah',
          organization: 'PT Air',
          address: 'Bandung',
        },
      }),
    },
    rekomtekBerkas: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'berkas-1', kode: '01', uraian: 'Dokumen teknis' },
        ]),
    },
    rekomtekReviewRound: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'round-1', roundNumber: 1 }),
    },
    rekomtekWorkflowEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
    rekomtekArtifact: {
      aggregate: jest.fn().mockResolvedValue({ _max: { version: 0 } }),
      create: jest.fn().mockResolvedValue({ id: 'generated-letter-1' }),
    },
    rejectionLetterJob: {
      create: jest.fn().mockResolvedValue({ id: 'rejection-job-1' }),
    },
    rekomtekReviewFinding: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rekomtekExposeSchedule: {
      create: jest.fn().mockResolvedValue({
        id: 'schedule-1',
        status: 'TERJADWAL',
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'schedule-1',
        status: 'TERJADWAL',
      }),
    },
    rekomtekFieldVisit: {
      create: jest.fn().mockResolvedValue({ id: 'field-visit-1' }),
    },
    rekomtekTeamAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    rekomtekNotification: {
      createMany: jest.fn(),
    },
  };
  const prisma = {
    rekomtek: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    rekomtekBerkas: { count: jest.fn().mockResolvedValue(1) },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'user-1', isActive: true }),
    },
    rekomtekTeamAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    rekomtekTeamMember: {
      findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'member-1', userId: 'pokja-1' }]),
    },
    rekomtekReviewRound: tx.rekomtekReviewRound,
    rekomtekReviewFinding: {
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rekomtekArtifact: {
      findFirst: jest.fn(),
    },
    rekomtekExposeSchedule: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    rekomtekFieldVisit: {
      findFirst: jest.fn(),
    },
    rekomtekWorkflowEvent: tx.rekomtekWorkflowEvent,
    $transaction: jest.fn(
      (
        operation: ((transaction: typeof tx) => unknown) | unknown[],
      ) =>
        Array.isArray(operation) ? Promise.all(operation) : operation(tx),
    ),
  };
  const berkasService = {
    revalidateRequired: jest.fn().mockResolvedValue({
      issues: [],
      incomplete: [],
    }),
  };
  const storage = {
    stage: jest.fn(),
    revalidate: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    getFile: jest.fn().mockResolvedValue({ stream: {}, size: 123 }),
  };
  const mailService = {
    sendRejectionLetterEmail: jest.fn().mockResolvedValue(undefined),
  };
  const whatsappOutbox = {
    enqueueWorkflowTransition: jest.fn().mockResolvedValue(0),
    enqueueExposeInvitation: jest.fn().mockResolvedValue(0),
    enqueueExposeRescheduled: jest.fn().mockResolvedValue(0),
    enqueueExposeCancelled: jest.fn().mockResolvedValue(0),
  };
  const service = new RekomtekWorkflowService(
    prisma as never,
    berkasService as never,
    storage as never,
    mailService as never,
    undefined,
    whatsappOutbox as never,
  );
  return {
    service,
    prisma,
    tx,
    berkasService,
    mailService,
    whatsappOutbox,
    storage,
  };
}

const letterDetails = {
  letterNumber: '600/123/SDA/2026',
  subject: 'Penolakan Permohonan Izin Sumber Daya Air',
  letterDate: '2026-10-06',
  city: 'Medan',
  institution: 'DINAS SUMBER DAYA AIR',
  signatoryName: 'Pejabat Contoh',
  signatoryPosition: 'Kepala Bidang',
  signatoryIdentity: 'NIP. 123456',
  expectedWorkflowVersion: 4,
};

function finalLetterFixture() {
  const fixture = createFixture();
  fixture.prisma.rekomtek.findUnique
    .mockResolvedValueOnce(
      record({
        workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
      }),
    )
    .mockResolvedValueOnce({
      nomor: 'RKT/001/2026',
      judul: 'Pemanfaatan Air',
      jenis: 'APU',
      jenisPermohonan: 'IZIN_BARU',
      createdBy: 'Budi',
      createdByUser: {
        firstName: 'Budi',
        lastName: 'Pemohon',
        organization: 'PT Air Mandiri',
        address: 'Medan',
      },
      reviewRounds: [
        {
          summary: 'Dokumen belum lengkap.',
          findings: [
            {
              note: 'Peta belum dilengkapi.',
              rekomtekBerkas: { kode: '3', uraian: 'Peta lokasi' },
            },
          ],
        },
      ],
    })
    .mockResolvedValueOnce({
      nomor: 'RKT/001/2026',
      judul: 'Pemanfaatan Air',
      createdByUser: {
        email: 'pemohon@example.com',
        firstName: 'Budi',
        lastName: 'Pemohon',
      },
    });
  fixture.storage.stage.mockResolvedValue({
    storageKey: 'active/generated.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    technicalStatus: 'VALID',
  });
  return fixture;
}

describe('direct rejection letter issuance', () => {
  const issuer = () =>
    actor({ permissions: ['rekomtek.reject', 'rekomtek.artifact'] });

  it('rejects uploading a Surat Penolakan PDF through the legacy artifact endpoint', async () => {
    const { service, prisma, storage } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
      }),
    );

    await expect(
      service.uploadArtifact(
        'rekomtek-1',
        { type: RekomtekArtifactType.SURAT_PENOLAKAN },
        {
          originalname: 'surat-penolakan.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('%PDF-'),
        } as Express.Multer.File,
        issuer(),
      ),
    ).rejects.toThrow(
      'Surat Penolakan tidak dapat diunggah atau difinalisasi; penerbitan menunggu aktivasi TTE',
    );
    expect(storage.stage).not.toHaveBeenCalled();
  });

  it('rejects finalizing an older uploaded rejection artifact', async () => {
    const { service, prisma, storage } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'legacy-rejection',
      type: RekomtekArtifactType.SURAT_PENOLAKAN,
      status: RekomtekArtifactStatus.DRAFT,
      stage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
      storageKey: 'active/legacy.pdf',
    });

    await expect(
      service.finalizeArtifact('rekomtek-1', 'legacy-rejection', issuer()),
    ).rejects.toThrow(
      'Surat Penolakan tidak dapat diunggah atau difinalisasi; penerbitan menunggu aktivasi TTE',
    );
    expect(storage.revalidate).not.toHaveBeenCalled();
  });

  it('rejects the legacy reject command instead of issuing an uploaded artifact', async () => {
    const { service, prisma, storage } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
      }),
    );

    await expect(service.legacyReject('rekomtek-1', issuer())).rejects.toThrow(
      'Gunakan antrean persetujuan surat penolakan; penerbitan langsung dinonaktifkan',
    );
    expect(storage.stage).not.toHaveBeenCalled();
  });

  it('blocks legacy manual previews so only queued snapshots can be reviewed', async () => {
    const { service, tx, storage } = finalLetterFixture();

    await expect(
      service.previewRejectionLetter('rekomtek-1', letterDetails, issuer()),
    ).rejects.toThrow('Gunakan antrean persetujuan surat penolakan');

    expect(storage.stage).not.toHaveBeenCalled();
    expect(tx.rekomtekArtifact.create).not.toHaveBeenCalled();
    expect(tx.rekomtek.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed for direct unsigned issuance while TTE is not activated', async () => {
    const { service, tx, storage, whatsappOutbox } = finalLetterFixture();

    await expect(
      service.generateAndIssueRejection('rekomtek-1', letterDetails, issuer()),
    ).rejects.toThrow('Penandatanganan dan penerbitan surat dinonaktifkan');

    expect(storage.stage).not.toHaveBeenCalled();
    expect(tx.rekomtekArtifact.create).not.toHaveBeenCalled();
    expect(tx.rekomtek.updateMany).not.toHaveBeenCalled();
    expect(whatsappOutbox.enqueueWorkflowTransition).not.toHaveBeenCalled();
  });

  it('rejects an unassigned member and a user without artifact permission', async () => {
    const first = finalLetterFixture();
    first.prisma.rekomtekTeamMember.findFirst.mockResolvedValue(null);
    first.prisma.rekomtekTeamMember.findMany.mockResolvedValue([]);
    await expect(
      first.service.generateAndIssueRejection(
        'rekomtek-1',
        letterDetails,
        issuer(),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(first.storage.stage).not.toHaveBeenCalled();
    const second = finalLetterFixture();
    await expect(
      second.service.generateAndIssueRejection(
        'rekomtek-1',
        letterDetails,
        actor({ permissions: ['rekomtek.reject'] }),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(second.storage.stage).not.toHaveBeenCalled();
  });
});

describe('RekomtekWorkflowService', () => {
  it('lists active Petugas as candidates for Pokja assignment', async () => {
    const { service, prisma } = createFixture();
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'petugas-1',
        firstName: 'Petugas',
        lastName: 'Satu',
        email: 'petugas@example.com',
        organization: 'UPT',
        role: { name: 'PETUGAS' },
        userRoles: [],
      },
    ]);

    await expect(
      service.getAssignableTeamMembers(
        actor({
          userId: 'pimpinan-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.assign'],
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'petugas-1',
        email: 'petugas@example.com',
      }),
    ]);
  });

  it('recognizes an assigned Petugas from active assignment members', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(record());
    prisma.rekomtekTeamMember.findFirst.mockResolvedValue(null);
    prisma.rekomtekTeamMember.findMany.mockResolvedValue([
      { id: 'member-1', userId: 'pokja-1' },
    ]);

    await expect(
      service.getWorkflow('rekomtek-1', actor()),
    ).resolves.toBeTruthy();
  });

  it('includes the checklist requirement on findings returned to correction applicants', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        reviewRounds: [
          {
            id: 'round-1',
            type: RekomtekReviewType.EVALUASI_AWAL,
            roundNumber: 1,
            findings: [
              {
                id: 'finding-1',
                rekomtekBerkasId: 'berkas-not-on-current-page',
                note: 'Dokumen perlu diperbaiki',
                applicantResponse: null,
                status: 'TERBUKA',
                rekomtekBerkas: { kode: '24', uraian: 'Surat kuasa' },
              },
            ],
          },
        ],
      }),
    );

    const result = await service.getWorkflow('rekomtek-1', actor());

    expect(prisma.rekomtek.findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          reviewRounds: expect.objectContaining({
            include: {
              findings: {
                include: {
                  rekomtekBerkas: {
                    select: { kode: true, uraian: true },
                  },
                },
              },
            },
          }),
        }),
      }),
    );
    expect(result.reviewRounds[0].findings[0].rekomtekBerkas).toEqual({
      kode: '24',
      uraian: 'Surat kuasa',
    });
  });

  it('returns display names and roles for workflow assignment members', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        teamAssignments: [
          {
            id: 'assignment-1',
            coordinatorId: 'pokja-1',
            assignedById: 'pimpinan-1',
            purpose: 'Pemeriksaan Berkas Persyaratan',
            isActive: true,
            members: [
              {
                id: 'member-1',
                userId: 'pokja-1',
                role: 'KOORDINATOR',
              },
            ],
          },
        ],
      }),
    );
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'pokja-1',
        firstName: 'Pak',
        lastName: 'Raden',
        role: { name: 'PETUGAS' },
        userRoles: [],
      },
    ]);

    const result = await service.getWorkflow('rekomtek-1', actor());

    expect(result).toEqual(
      expect.objectContaining({
        teamAssignments: [
          expect.objectContaining({
            members: [
              expect.objectContaining({
                user: { displayName: 'Pak Raden', roleName: 'PETUGAS' },
              }),
            ],
          }),
        ],
      }),
    );
  });

  it('rejects a team assignment that contains a non-Petugas account', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.MENUNGGU_PENUNJUKAN_POKJA,
        status: RekomtekStatus.REVIEW,
      }),
    );
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        role: { name: 'USER' },
        userRoles: [],
      },
    ]);

    await expect(
      service.assignTeam(
        'rekomtek-1',
        {
          coordinatorId: 'user-1',
          memberIds: ['user-1'],
          purpose: 'Review dokumen',
        },
        actor({
          userId: 'pimpinan-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.assign'],
        }),
      ),
    ).rejects.toThrow('ber-role PETUGAS');
  });

  it('allows a Pejabat to create an Expose invitation after document review', async () => {
    const { service, prisma, tx } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE,
        status: RekomtekStatus.REVIEW,
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'invitation-artifact-1',
      type: RekomtekArtifactType.UNDANGAN_EKSPOSE,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
    });
    prisma.rekomtekTeamAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      members: [{ userId: 'pokja-1' }],
    });
    prisma.user.findMany.mockResolvedValue([
      { id: 'pemohon-1', role: { name: 'USER' }, userRoles: [] },
      { id: 'pimpinan-1', role: { name: 'PIMPINAN' }, userRoles: [] },
      { id: 'pokja-1', role: { name: 'PETUGAS' }, userRoles: [] },
    ]);
    const scheduleInput = {
      startsAt: '2026-09-01T02:00:00.000Z',
      endsAt: '2026-09-01T03:00:00.000Z',
      method: 'DARING',
      meetingUrl: 'https://meet.example.com/ekspose-1',
      agenda: 'Pembahasan Permohonan Rekomtek',
      participantIds: ['pemohon-1', 'pimpinan-1', 'pokja-1'],
      externalParticipants: [
        {
          name: 'T. M. Iqbal Aziz',
          organization: 'Dinas PUPR Provinsi',
          position: 'Kepala Bidang',
          email: 'iqbal@pupr.example.go.id',
          whatsappNumber: '0812 3456 7890',
        },
      ],
      responsibleUserId: 'pimpinan-1',
      invitationNumber: 'UND/001/2026',
      invitationArtifactId: 'invitation-artifact-1',
    } as never;

    await expect(
      service.scheduleExpose(
        'rekomtek-1',
        scheduleInput,
        actor({
          userId: 'pimpinan-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.expose'],
        }),
      ),
    ).resolves.toBeTruthy();

    expect(tx.rekomtekExposeSchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rekomtekId: 'rekomtek-1',
          invitationNumber: 'UND/001/2026',
          invitationArtifactId: 'invitation-artifact-1',
          participants: [
            'pemohon-1',
            'pimpinan-1',
            'pokja-1',
            {
              type: 'EXTERNAL',
              name: 'T. M. Iqbal Aziz',
              organization: 'Dinas PUPR Provinsi',
              position: 'Kepala Bidang',
              email: 'iqbal@pupr.example.go.id',
              whatsappNumber: '+6281234567890',
            },
          ],
          status: 'TERJADWAL',
        }),
      }),
    );
  });

  it('reschedules a TERJADWAL Expose and enqueues a reschedule notification', async () => {
    const { service, prisma, tx, whatsappOutbox } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
        workflowVersion: 8,
      }),
    );
    prisma.rekomtekExposeSchedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      rekomtekId: 'rekomtek-1',
      startsAt: new Date('2026-09-10T02:00:00.000Z'),
      endsAt: new Date('2026-09-10T03:00:00.000Z'),
      scheduleVersion: 2,
      status: RekomtekExposeStatus.TERJADWAL,
      invitationArtifactId: 'invitation-artifact-old',
    });
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'invitation-artifact-new',
      type: RekomtekArtifactType.UNDANGAN_EKSPOSE,
      stage: RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
    });
    tx.rekomtekExposeSchedule.updateMany.mockResolvedValue({ count: 1 });
    tx.rekomtekExposeSchedule.findUnique.mockResolvedValue({
      id: 'schedule-1',
      status: RekomtekExposeStatus.TERJADWAL,
      scheduleVersion: 3,
    });
    tx.rekomtekWorkflowEvent.create.mockResolvedValue({
      id: 'reschedule-event-1',
    });

    await expect(
      service.rescheduleExpose(
        'rekomtek-1',
        'schedule-1',
        {
          startsAt: '2026-09-11T02:00:00.000Z',
          endsAt: '2026-09-11T03:00:00.000Z',
          invitationArtifactId: 'invitation-artifact-new',
          reason: 'Penyesuaian agenda pejabat',
        },
        actor({
          userId: 'pimpinan-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.expose'],
        }),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'schedule-1',
        scheduleVersion: 3,
      }),
    );

    expect(tx.rekomtekExposeSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'schedule-1',
        rekomtekId: 'rekomtek-1',
        status: RekomtekExposeStatus.TERJADWAL,
        scheduleVersion: 2,
      },
      data: {
        startsAt: new Date('2026-09-11T02:00:00.000Z'),
        endsAt: new Date('2026-09-11T03:00:00.000Z'),
        invitationArtifactId: 'invitation-artifact-new',
        scheduleVersion: { increment: 1 },
      },
    });
    expect(tx.rekomtekWorkflowEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStage: RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
        toStage: RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
        action: 'RESCHEDULE_EKSPOSE',
        reason: 'Penyesuaian agenda pejabat',
      }),
    });
    expect(whatsappOutbox.enqueueExposeRescheduled).toHaveBeenCalledWith(tx, {
      scheduleId: 'schedule-1',
      eventId: 'reschedule-event-1',
    });
  });

  it('cancels a TERJADWAL Expose, returns to scheduling, and enqueues a cancellation notification', async () => {
    const { service, prisma, tx, whatsappOutbox } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
        workflowVersion: 9,
      }),
    );
    prisma.rekomtekExposeSchedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      rekomtekId: 'rekomtek-1',
      startsAt: new Date('2026-09-10T02:00:00.000Z'),
      endsAt: new Date('2026-09-10T03:00:00.000Z'),
      scheduleVersion: 2,
      status: RekomtekExposeStatus.TERJADWAL,
    });
    tx.rekomtekExposeSchedule.updateMany.mockResolvedValue({ count: 1 });
    tx.rekomtekWorkflowEvent.create.mockResolvedValue({
      id: 'cancel-event-1',
    });

    await expect(
      service.cancelExpose(
        'rekomtek-1',
        'schedule-1',
        { reason: 'Jadwal ditunda oleh Pejabat Rekomtek' },
        actor({
          userId: 'pimpinan-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.expose'],
        }),
      ),
    ).resolves.toBeTruthy();

    expect(tx.rekomtekExposeSchedule.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'schedule-1',
        rekomtekId: 'rekomtek-1',
        status: RekomtekExposeStatus.TERJADWAL,
        scheduleVersion: 2,
      },
      data: {
        status: RekomtekExposeStatus.DIBATALKAN,
        cancellationReason: 'Jadwal ditunda oleh Pejabat Rekomtek',
        scheduleVersion: { increment: 1 },
      },
    });
    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
        }),
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE,
        }),
      }),
    );
    expect(whatsappOutbox.enqueueExposeCancelled).toHaveBeenCalledWith(tx, {
      scheduleId: 'schedule-1',
      eventId: 'cancel-event-1',
    });
  });

  it('rejects an exact active Expose start slot that is already booked', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE,
        status: RekomtekStatus.REVIEW,
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'invitation-artifact-1',
      type: RekomtekArtifactType.UNDANGAN_EKSPOSE,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
    });
    prisma.rekomtekTeamAssignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      members: [{ userId: 'pokja-1' }],
    });
    prisma.user.findMany.mockResolvedValue([
      { id: 'pemohon-1', role: { name: 'USER' }, userRoles: [] },
      { id: 'pimpinan-1', role: { name: 'PIMPINAN' }, userRoles: [] },
      { id: 'pokja-1', role: { name: 'PETUGAS' }, userRoles: [] },
    ]);
    prisma.rekomtekExposeSchedule.findFirst.mockResolvedValue({
      id: 'existing-schedule-1',
      startsAt: new Date('2026-09-01T02:00:00.000Z'),
      status: RekomtekExposeStatus.TERJADWAL,
    });

    await expect(
      service.scheduleExpose(
        'rekomtek-1',
        {
          startsAt: '2026-09-01T02:00:00.000Z',
          endsAt: '2026-09-01T03:00:00.000Z',
          method: 'DARING',
          meetingUrl: 'https://meet.example.com/ekspose-2',
          agenda: 'Pembahasan Permohonan Rekomtek Kedua',
          participantIds: ['pemohon-1', 'pimpinan-1', 'pokja-1'],
          responsibleUserId: 'pimpinan-1',
          invitationNumber: 'UND/002/2026',
          invitationArtifactId: 'invitation-artifact-1',
        },
        actor({
          userId: 'pimpinan-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.expose'],
        }),
      ),
    ).rejects.toThrow(/slot jadwal ekspose.*sudah digunakan/i);
  });

  it('returns active Expose slots for the scheduling form', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtekExposeSchedule.findMany.mockResolvedValue([
      {
        startsAt: new Date('2026-09-01T03:00:00.000Z'),
        endsAt: new Date('2026-09-01T04:00:00.000Z'),
      },
    ]);

    await expect(
      service.getOccupiedExposeSlots(
        actor({
          userId: 'pimpinan-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.expose'],
        }),
      ),
    ).resolves.toEqual([
      {
        startsAt: new Date('2026-09-01T03:00:00.000Z'),
        endsAt: new Date('2026-09-01T04:00:00.000Z'),
      },
    ]);
    expect(prisma.rekomtekExposeSchedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            in: [RekomtekExposeStatus.DRAFT, RekomtekExposeStatus.TERJADWAL],
          },
        },
      }),
    );
  });

  it('does not allow an assigned Petugas to create an Expose invitation', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE,
      }),
    );

    await expect(
      service.scheduleExpose(
        'rekomtek-1',
        {
          startsAt: '2026-09-01T02:00:00.000Z',
          endsAt: '2026-09-01T03:00:00.000Z',
          method: 'DARING',
          meetingUrl: 'https://meet.example.com/ekspose-1',
          agenda: 'Pembahasan Permohonan Rekomtek',
          participantIds: ['pemohon-1', 'pimpinan-1', 'pokja-1'],
          responsibleUserId: 'pokja-1',
          invitationNumber: 'UND/002/2026',
          invitationArtifactId: 'invitation-artifact-1',
        },
        actor({ permissions: ['rekomtek.expose'] }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a Pejabat send an Expose result back for document correction', async () => {
    const { service, prisma, tx } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.VERIFIKASI_HASIL_EKSPOSE,
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'ba-expose-1',
      type: RekomtekArtifactType.BERITA_ACARA_EKSPOSE,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
    });

    await service.verifyExpose(
      'rekomtek-1',
      {
        decision: 'KURANG',
        findings: [
          { berkasId: 'berkas-1', note: 'Peta lokasi perlu diperbaiki' },
        ],
      },
      actor({
        userId: 'pimpinan-1',
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.expose'],
      }),
    );

    expect(tx.rekomtekReviewRound.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: RekomtekReviewType.PASCA_EKSPOSE,
          decision: 'DIKEMBALIKAN',
        }),
      }),
    );
    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.PERBAIKAN_PASCA_EKSPOSE,
          status: RekomtekStatus.DRAFT,
        }),
      }),
    );
  });

  it('lets a Pejabat continue directly to the SPT stage when Expose is complete', async () => {
    const { service, prisma, tx } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.VERIFIKASI_HASIL_EKSPOSE,
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'ba-expose-1',
      type: RekomtekArtifactType.BERITA_ACARA_EKSPOSE,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
    });

    await service.verifyExpose(
      'rekomtek-1',
      { decision: 'LENGKAP' },
      actor({
        userId: 'pimpinan-1',
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.expose'],
      }),
    );

    expect(tx.rekomtekReviewRound.create).not.toHaveBeenCalled();
    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN,
        }),
      }),
    );
  });

  it('does not let a Petugas decide the result of an Expose', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.VERIFIKASI_HASIL_EKSPOSE,
      }),
    );

    await expect(
      service.verifyExpose(
        'rekomtek-1',
        { decision: 'LENGKAP' },
        actor({ permissions: ['rekomtek.expose'] }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a Pejabat issue an SPT only to an active Pokja member', async () => {
    const { service, prisma, tx } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN,
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'spt-artifact-1',
      type: RekomtekArtifactType.SPT_LAPANGAN,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'pokja-1',
      isActive: true,
    });
    prisma.rekomtekTeamMember.findMany.mockResolvedValue([
      { id: 'member-1', userId: 'pokja-1' },
    ]);

    await service.issueFieldVisit(
      'rekomtek-1',
      {
        sptNumber: 'SPT/001/2026',
        issuedAt: '2026-09-01T02:00:00.000Z',
        petugasId: 'pokja-1',
        location: 'Lokasi monitoring',
        scheduledStartsAt: '2026-09-03T02:00:00.000Z',
        scheduledEndsAt: '2026-09-03T05:00:00.000Z',
        scope: 'Monitoring kondisi lapangan',
        artifactId: 'spt-artifact-1',
      },
      actor({
        userId: 'pimpinan-1',
        role: 'PIMPINAN',
        roles: ['PIMPINAN'],
        permissions: ['rekomtek.field'],
      }),
    );

    expect(tx.rekomtekFieldVisit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sptNumber: 'SPT/001/2026',
          petugasId: 'pokja-1',
          artifactId: 'spt-artifact-1',
        }),
      }),
    );
    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.KUNJUNGAN_LAPANGAN_DITUGASKAN,
        }),
      }),
    );
  });

  it('only lets the assigned PIC record field-visit realization', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.KUNJUNGAN_LAPANGAN_DITUGASKAN,
      }),
    );
    prisma.rekomtekFieldVisit.findFirst.mockResolvedValue({
      id: 'field-visit-1',
      rekomtekId: 'rekomtek-1',
      petugasId: 'pic-1',
      status: 'DITUGASKAN',
    });

    await expect(
      service.completeFieldVisit(
        'rekomtek-1',
        'field-visit-1',
        {
          realizedAt: '2026-09-03T05:00:00.000Z',
          realizationNotes: 'Kunjungan selesai',
        },
        actor({
          userId: 'member-2',
          role: 'PETUGAS',
          roles: ['PETUGAS'],
          permissions: ['rekomtek.field'],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps a post-Expose applicant response pending Pokja verification', async () => {
    const { service, prisma, tx } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.PERBAIKAN_PASCA_EKSPOSE,
        status: RekomtekStatus.DRAFT,
        createdById: 'pemohon-1',
      }),
    );
    tx.rekomtekReviewFinding.findMany.mockResolvedValue([
      { id: 'finding-1', applicantResponse: null },
    ]);

    await service.submitPostExposeCorrection(
      'rekomtek-1',
      {
        responses: [
          { findingId: 'finding-1', response: 'Dokumen sudah diperbaiki' },
        ],
      },
      actor({
        userId: 'pemohon-1',
        role: 'USER',
        roles: ['USER'],
        permissions: ['rekomtek.correct.post-expose'],
      }),
    );

    expect(tx.rekomtekReviewFinding.update).toHaveBeenCalledWith({
      where: { id: 'finding-1' },
      data: {
        applicantResponse: 'Dokumen sudah diperbaiki',
        status: 'TERJAWAB',
      },
    });
    expect(tx.rekomtekReviewFinding.updateMany).not.toHaveBeenCalled();
  });

  it('closes verified post-Expose findings before moving to SPT', async () => {
    const { service, prisma, tx, berkasService } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE,
      }),
    );
    prisma.rekomtekReviewFinding.count.mockResolvedValue(0);
    berkasService.revalidateRequired.mockResolvedValue({
      issues: [],
      incomplete: [],
    });

    await service.verifyPostExposeCorrection(
      'rekomtek-1',
      { decision: 'LENGKAP' },
      actor({
        userId: 'pokja-1',
        role: 'PETUGAS',
        roles: ['PETUGAS'],
        permissions: ['rekomtek.evaluate'],
      }),
    );

    expect(tx.rekomtekReviewFinding.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DITUTUP',
          resolvedById: 'pokja-1',
        }),
      }),
    );
    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN,
        }),
      }),
    );
  });

  it('gives the initial correction once and records one finding package transactionally', async () => {
    const { service, prisma, tx } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(record());

    const result = await service.evaluateInitial(
      'rekomtek-1',
      {
        decision: 'DIKEMBALIKAN',
        findings: [{ berkasId: 'berkas-1', note: 'Scan tidak terbaca' }],
      },
      actor(),
    );

    expect(result).toMatchObject({ id: 'rekomtek-1' });
    expect(tx.rekomtekReviewRound.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: RekomtekReviewType.EVALUASI_AWAL,
          decision: 'DIKEMBALIKAN',
          findings: expect.objectContaining({
            create: [
              expect.objectContaining({
                rekomtekBerkasId: 'berkas-1',
                note: 'Scan tidak terbaca',
              }),
            ],
          }),
        }),
      }),
    );
    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL,
          workflowVersion: 4,
        }),
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.PERBAIKAN_AWAL_PEMOHON,
          status: RekomtekStatus.DRAFT,
          initialCorrectionCount: { increment: 1 },
        }),
      }),
    );
    expect(tx.rekomtekWorkflowEvent.create).toHaveBeenCalledTimes(1);
  });

  it('lets an applicant submit technically valid links before Pokja verification', async () => {
    const { service, prisma, berkasService } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.PEMOHON_DRAFT,
        status: RekomtekStatus.DRAFT,
        createdById: 'pemohon-1',
      }),
    );
    berkasService.revalidateRequired.mockResolvedValue({
      issues: [],
      incomplete: [{ id: 'berkas-1', kode: '1', uraian: 'Surat permohonan' }],
    });

    await expect(
      service.submitApplication(
        'rekomtek-1',
        actor({
          userId: 'pemohon-1',
          role: 'USER',
          roles: ['USER'],
          permissions: ['rekomtek.submit'],
        }),
      ),
    ).resolves.toBeTruthy();
  });

  it('rejects a second initial correction even when the request is manipulated', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({ initialCorrectionCount: 1 }),
    );

    await expect(
      service.evaluateInitial(
        'rekomtek-1',
        {
          decision: 'DIKEMBALIKAN',
          findings: [{ berkasId: 'berkas-1', note: 'Temuan kedua' }],
        },
        actor(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an evaluation summary when re-evaluation findings indicate rejection', async () => {
    const { service, prisma, tx } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.EVALUASI_DOKUMEN_ULANG,
        workflowVersion: 7,
      }),
    );

    await expect(
      service.evaluateInitialRecheck(
        'rekomtek-1',
        {
          decision: 'TIDAK_MEMENUHI',
          findings: [{ berkasId: 'berkas-1', note: 'Tidak lengkap' }],
        },
        actor(),
      ),
    ).rejects.toThrow('Ringkasan dan minimal satu temuan wajib diisi');
    expect(tx.rejectionLetterJob.create).not.toHaveBeenCalled();
  });

  it('routes an unsuccessful re-evaluation to the rejection-letter stage', async () => {
    const { service, prisma, tx } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.EVALUASI_DOKUMEN_ULANG,
        workflowVersion: 7,
      }),
    );

    await service.evaluateInitialRecheck(
      'rekomtek-1',
      {
        decision: 'TIDAK_MEMENUHI',
        summary: 'Masih terdapat kekurangan dokumen.',
        findings: [{ berkasId: 'berkas-1', note: 'Masih tidak valid' }],
      },
      actor(),
    );

    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
          status: RekomtekStatus.REVIEW,
        }),
      }),
    );
    expect(tx.rejectionLetterJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rekomtekId: 'rekomtek-1',
        evaluationRoundId: 'round-1',
        createdById: 'pokja-1',
        status: 'WAITING_APPROVAL',
        applicantSnapshot: expect.objectContaining({
          applicationNumber: 'RKT/001/2026',
          applicantName: 'Siti Aminah',
          applicantOrganization: 'PT Air',
        }),
        evaluationSnapshot: expect.objectContaining({
          summary: 'Masih terdapat kekurangan dokumen.',
          findings: [
            { requirement: '01 Dokumen teknis', note: 'Masih tidak valid' },
          ],
        }),
        events: {
          create: expect.objectContaining({
            action: 'AUTO_QUEUE_CREATED',
            toStatus: 'WAITING_APPROVAL',
            actorId: 'pokja-1',
          }),
        },
      }),
    });
  });

  it('does not let an unassigned Petugas open the rejection-letter form', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
      }),
    );
    prisma.rekomtekTeamMember.findFirst.mockResolvedValue(null);
    prisma.rekomtekTeamMember.findMany.mockResolvedValue([]);

    await expect(
      service.getRejectionLetterContext(
        'rekomtek-1',
        actor({ permissions: ['rekomtek.reject', 'rekomtek.artifact'] }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces separation between official reviewer and superior approver', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.MENUNGGU_PERSETUJUAN_ATASAN,
        reviewedBy: 'pimpinan-1',
      }),
    );

    await expect(
      service.superiorApproval(
        'rekomtek-1',
        { decision: 'SETUJUI' },
        actor({
          userId: 'pimpinan-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.approve.final'],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let PIMPINAN use final approval without the KEPALA_BIDANG role', async () => {
    const { service, prisma } = createFixture();

    await expect(
      service.superiorApproval(
        'rekomtek-1',
        { decision: 'KEMBALIKAN', note: 'Perlu diperbaiki' },
        actor({
          userId: 'pejabat-1',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.approve.final'],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rekomtek.findUnique).not.toHaveBeenCalled();
  });

  it('does not allow a missing workflow migration to be treated as a normal stage', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({ workflowStage: null, workflowMigrationRequired: true }),
    );

    await expect(
      service.getWorkflow(
        'rekomtek-1',
        actor({ permissions: ['rekomtek.workflow.read'] }),
      ),
    ).rejects.toThrow('belum dipetakan');
  });

  it('lets the applicant read correction findings without exposing internal artifacts', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.PERBAIKAN_AWAL_PEMOHON,
        status: RekomtekStatus.DRAFT,
        createdById: 'pemohon-1',
        artifacts: [{ storageKey: 'private/internal-artifact' }],
        reviewRounds: [
          {
            type: RekomtekReviewType.EVALUASI_AWAL,
            findings: [
              {
                id: 'finding-1',
                rekomtekBerkasId: 'berkas-1',
                note: 'Dokumen perlu diperjelas',
                applicantResponse: null,
                status: 'TERBUKA',
              },
            ],
          },
        ],
      }),
    );

    await expect(
      service.getWorkflow(
        'rekomtek-1',
        actor({
          userId: 'pemohon-1',
          role: 'USER',
          roles: ['USER'],
          permissions: ['rekomtek.read'],
        }),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'rekomtek-1',
        artifacts: [],
      }),
    );
  });

  it('exposes only final output artifacts to an applicant', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        createdById: 'pemohon-1',
        artifacts: [
          {
            id: 'draft-rejection',
            type: RekomtekArtifactType.SURAT_PENOLAKAN,
            status: RekomtekArtifactStatus.DRAFT,
            technicalStatus: BerkasTechnicalStatus.VALID,
          },
          {
            id: 'final-rejection',
            type: RekomtekArtifactType.SURAT_PENOLAKAN,
            status: RekomtekArtifactStatus.FINAL,
            technicalStatus: BerkasTechnicalStatus.VALID,
          },
          {
            id: 'internal-final',
            type: 'BERITA_ACARA_EKSPOSE',
            status: RekomtekArtifactStatus.FINAL,
            technicalStatus: BerkasTechnicalStatus.VALID,
          },
        ],
      }),
    );

    await expect(
      service.getWorkflow(
        'rekomtek-1',
        actor({
          userId: 'pemohon-1',
          role: 'USER',
          roles: ['USER'],
          permissions: ['rekomtek.read'],
        }),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        artifacts: [expect.objectContaining({ id: 'final-rejection' })],
      }),
    );
  });

  it('lets the applicant download their final rejection letter with read access', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.DITOLAK,
        status: RekomtekStatus.REJECTED,
        createdById: 'pemohon-1',
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'final-rejection',
      rekomtekId: 'rekomtek-1',
      type: 'SURAT_PENOLAKAN',
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
      storageKey: 'active/rejection.pdf',
      mimeType: 'application/pdf',
      fileName: 'surat-penolakan.pdf',
    });

    await expect(
      service.getArtifactFile(
        'rekomtek-1',
        'final-rejection',
        actor({
          userId: 'pemohon-1',
          role: 'USER',
          roles: ['USER'],
          permissions: ['rekomtek.read'],
        }),
      ),
    ).resolves.toMatchObject({
      size: 123,
      mimeType: 'application/pdf',
      fileName: 'surat-penolakan.pdf',
    });
  });

  it('lets the applicant download a final test-only rejection letter from generated storage', async () => {
    const { service, prisma, storage } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.DITOLAK,
        status: RekomtekStatus.REJECTED,
        createdById: 'pemohon-1',
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'test-rejection',
      rekomtekId: 'rekomtek-1',
      type: RekomtekArtifactType.SURAT_PENOLAKAN,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
      stage: RekomtekWorkflowStage.DITOLAK,
      storageKey: 'generated/test-rejection.pdf',
      mimeType: 'application/pdf',
      fileName: 'UJI-LOKAL-surat-penolakan.pdf',
      metadata: {
        issuanceMethod: 'HEAD_APPROVAL_QR',
        isTestOnly: true,
        sourceJobId: 'job-test',
      },
    });

    await expect(
      service.getArtifactFile(
        'rekomtek-1',
        'test-rejection',
        actor({
          userId: 'pemohon-1',
          role: 'USER',
          roles: ['USER'],
          permissions: ['rekomtek.read'],
        }),
      ),
    ).resolves.toMatchObject({
      size: 123,
      mimeType: 'application/pdf',
      fileName: 'UJI-LOKAL-surat-penolakan.pdf',
    });
    expect(storage.getFile).toHaveBeenCalledWith(
      'generated/test-rejection.pdf',
    );
  });

  it('keeps other generated artifacts unavailable to normal downloads', async () => {
    const { service, prisma, storage } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.DITOLAK,
        status: RekomtekStatus.REJECTED,
        createdById: 'pemohon-1',
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'generated-internal',
      rekomtekId: 'rekomtek-1',
      type: RekomtekArtifactType.SURAT_PENOLAKAN,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
      stage: RekomtekWorkflowStage.DITOLAK,
      storageKey: 'generated/internal.pdf',
      mimeType: 'application/pdf',
      fileName: 'internal.pdf',
      metadata: null,
    });

    await expect(
      service.getArtifactFile(
        'rekomtek-1',
        'generated-internal',
        actor({
          userId: 'pemohon-1',
          role: 'USER',
          roles: ['USER'],
          permissions: ['rekomtek.read'],
        }),
      ),
    ).rejects.toThrow('Artefak belum berada pada storage aktif');
    expect(storage.getFile).not.toHaveBeenCalled();
  });

  it('lets the applicant download an officially issued QR rejection letter', async () => {
    const { service, prisma, storage } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.DITOLAK,
        status: RekomtekStatus.REJECTED,
        createdById: 'pemohon-1',
      }),
    );
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'official-qr',
      rekomtekId: 'rekomtek-1',
      type: RekomtekArtifactType.SURAT_PENOLAKAN,
      status: RekomtekArtifactStatus.FINAL,
      technicalStatus: BerkasTechnicalStatus.VALID,
      stage: RekomtekWorkflowStage.DITOLAK,
      storageKey: 'generated/official-qr.pdf',
      mimeType: 'application/pdf',
      fileName: 'surat-penolakan.pdf',
      metadata: {
        issuanceMethod: 'HEAD_APPROVAL_QR',
        isTestOnly: false,
        sourceJobId: 'job-official',
      },
    });
    await expect(
      service.getArtifactFile(
        'rekomtek-1',
        'official-qr',
        actor({
          userId: 'pemohon-1',
          role: 'USER',
          roles: ['USER'],
          permissions: ['rekomtek.read'],
        }),
      ),
    ).resolves.toMatchObject({ fileName: 'surat-penolakan.pdf' });
    expect(storage.getFile).toHaveBeenCalledWith('generated/official-qr.pdf');
  });

  it('transitions a local QR test issue to DITOLAK without notifications', async () => {
    const { service, tx, whatsappOutbox } = createFixture();
    tx.rekomtek.findUnique.mockResolvedValueOnce(
      record({
        workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
        workflowVersion: 5,
      }),
    );
    const serviceWithQrTransition = service as unknown as {
      transitionRejectionToIssuedInTransaction: (
        transaction: unknown,
        rekomtekId: string,
        user: unknown,
        metadata: unknown,
        options: { suppressNotifications: boolean },
      ) => Promise<unknown>;
    };

    await serviceWithQrTransition.transitionRejectionToIssuedInTransaction(
      tx,
      'rekomtek-1',
      actor({
        role: 'KEPALA_BIDANG',
        roles: ['KEPALA_BIDANG'],
        permissions: ['rekomtek.approve.final'],
      }),
      { issuanceMethod: 'HEAD_APPROVAL_QR', isTestOnly: true },
      { suppressNotifications: true },
    );

    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'rekomtek-1',
          workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
          workflowVersion: 5,
        }),
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.DITOLAK,
          status: RekomtekStatus.REJECTED,
        }),
      }),
    );
    expect(tx.rekomtekWorkflowEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'TERBITKAN_SURAT_PENOLAKAN_QR_UJI_LOKAL',
          toStage: RekomtekWorkflowStage.DITOLAK,
        }),
      }),
    );
    expect(tx.rekomtekNotification.createMany).not.toHaveBeenCalled();
    expect(whatsappOutbox.enqueueWorkflowTransition).not.toHaveBeenCalled();
  });

  it('limits a KEPALA_BIDANG queue to pending superior approval only', async () => {
    const { service, prisma } = createFixture();

    await service.findQueue(
      { page: 1, limit: 20 },
      actor({
        userId: 'head-1',
        role: 'KEPALA_BIDANG',
        roles: ['KEPALA_BIDANG'],
        permissions: ['rekomtek.workflow.read'],
      }),
    );

    expect(prisma.rekomtek.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.MENUNGGU_PERSETUJUAN_ATASAN,
        }),
      }),
    );
    expect(prisma.rekomtek.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'createdById',
    );
  });
});
