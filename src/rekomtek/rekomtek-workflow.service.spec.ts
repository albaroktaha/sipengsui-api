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
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'rekomtek-1', status: RekomtekStatus.REVIEW }),
    },
    rekomtekReviewRound: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'round-1', roundNumber: 1 }),
    },
    rekomtekWorkflowEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
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
    rekomtek: { findUnique: jest.fn() },
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
    rekomtekWorkflowEvent: tx.rekomtekWorkflowEvent,
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
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
    remove: jest.fn(),
    getFile: jest.fn().mockResolvedValue({ stream: {}, size: 123 }),
  };
  const mailService = {
    sendRejectionLetterEmail: jest.fn().mockResolvedValue(undefined),
  };
  const service = new RekomtekWorkflowService(
    prisma as never,
    berkasService as never,
    storage as never,
    mailService as never,
  );
  return { service, prisma, tx, berkasService, mailService };
}

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
        findings: [{ berkasId: 'berkas-1', note: 'Masih tidak valid' }],
      },
      actor(),
    );

    expect(tx.rekomtek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
          status: RekomtekStatus.REJECTED,
        }),
      }),
    );
  });

  it('generates a draft rejection PDF from the latest re-evaluation findings', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique
      .mockResolvedValueOnce(
        record({
          workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
          status: RekomtekStatus.REVIEW,
        }),
      )
      .mockResolvedValueOnce({
        nomor: 'RKT/001/2026',
        judul: 'Pemanfaatan Air Permukaan',
        jenis: 'APU',
        jenisPermohonan: 'IZIN_BARU',
        createdBy: 'PT Tirta Contoh',
        createdByUser: {
          firstName: 'Tirta',
          lastName: 'Contoh',
          organization: 'PT Tirta Contoh',
          address: 'Kabupaten Bandung',
        },
        reviewRounds: [
          {
            summary: 'Persyaratan belum terpenuhi pada evaluasi ulang.',
            findings: [
              {
                note: 'Peta lokasi belum dapat diverifikasi.',
                rekomtekBerkas: {
                  kode: '3',
                  uraian: 'Peta lokasi',
                },
              },
            ],
          },
        ],
      });

    const result = await service.getRejectionLetterDraftPdf(
      'rekomtek-1',
      actor({ permissions: ['rekomtek.read', 'rekomtek.workflow.read'] }),
    );

    expect(result.fileName).toBe('RKT-001-2026-draft-surat-penolakan.pdf');
    expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('lets the applicant download the rejection draft for their own application', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique
      .mockResolvedValueOnce(
        record({
          workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
          status: RekomtekStatus.REVIEW,
          createdById: 'pemohon-1',
        }),
      )
      .mockResolvedValueOnce({
        nomor: 'RKT/002/2026',
        judul: 'Permohonan Ditolak',
        jenis: 'APU',
        jenisPermohonan: 'IZIN_BARU',
        createdBy: 'Pemohon Contoh',
        createdByUser: {
          firstName: 'Pemohon',
          lastName: 'Contoh',
          organization: 'PT Contoh',
          address: 'Kabupaten Bandung',
        },
        reviewRounds: [
          {
            summary: 'Persyaratan belum terpenuhi.',
            findings: [
              {
                note: 'Dokumen belum sesuai.',
                rekomtekBerkas: {
                  kode: '1',
                  uraian: 'Surat permohonan',
                },
              },
            ],
          },
        ],
      });

    const result = await service.getRejectionLetterDraftPdf(
      'rekomtek-1',
      actor({
        userId: 'pemohon-1',
        role: 'USER',
        roles: ['USER'],
        permissions: ['rekomtek.read'],
      }),
    );

    expect(result.fileName).toBe('RKT-002-2026-draft-surat-penolakan.pdf');
    expect(result.buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('emails the applicant after a rejection is successfully issued', async () => {
    const { service, prisma, mailService } = createFixture();
    prisma.rekomtek.findUnique
      .mockResolvedValueOnce(
        record({
          workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
        }),
      )
      .mockResolvedValueOnce({
        nomor: 'RKT/001/2026',
        judul: 'Pemanfaatan Air Permukaan',
        createdByUser: {
          email: 'pemohon@example.com',
          firstName: 'Tirta',
          lastName: 'Contoh',
        },
      });
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'artifact-1',
      type: 'SURAT_PENOLAKAN',
      status: 'FINAL',
      technicalStatus: 'VALID',
    });

    await service.issueRejection(
      'rekomtek-1',
      actor({ permissions: ['rekomtek.reject'] }),
    );

    expect(mailService.sendRejectionLetterEmail).toHaveBeenCalledWith({
      email: 'pemohon@example.com',
      applicantName: 'Tirta Contoh',
      applicationNumber: 'RKT/001/2026',
      applicationTitle: 'Pemanfaatan Air Permukaan',
      applicationUrl: `${process.env.APP_URL ?? 'http://localhost:3001'}/dashboard/rekomtek/rekomtek-1`,
    });
  });

  it('keeps the rejection successful when SMTP delivery fails', async () => {
    const { service, prisma, mailService } = createFixture();
    prisma.rekomtek.findUnique
      .mockResolvedValueOnce(
        record({
          workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
        }),
      )
      .mockResolvedValueOnce({
        nomor: 'RKT/001/2026',
        judul: 'Pemanfaatan Air Permukaan',
        createdByUser: {
          email: 'pemohon@example.com',
          firstName: 'Tirta',
          lastName: 'Contoh',
        },
      });
    prisma.rekomtekArtifact.findFirst.mockResolvedValue({
      id: 'artifact-1',
      type: 'SURAT_PENOLAKAN',
      status: 'FINAL',
      technicalStatus: 'VALID',
    });
    mailService.sendRejectionLetterEmail.mockRejectedValue(
      new Error('SMTP unavailable'),
    );

    await expect(
      service.issueRejection(
        'rekomtek-1',
        actor({ permissions: ['rekomtek.reject'] }),
      ),
    ).resolves.toBeTruthy();
    expect(mailService.sendRejectionLetterEmail).toHaveBeenCalledTimes(1);
  });

  it('does not let an unassigned Petugas download the rejection draft', async () => {
    const { service, prisma } = createFixture();
    prisma.rekomtek.findUnique.mockResolvedValue(
      record({
        workflowStage: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
      }),
    );
    prisma.rekomtekTeamMember.findFirst.mockResolvedValue(null);
    prisma.rekomtekTeamMember.findMany.mockResolvedValue([]);

    await expect(
      service.getRejectionLetterDraftPdf(
        'rekomtek-1',
        actor({ permissions: ['rekomtek.read', 'rekomtek.workflow.read'] }),
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
});
