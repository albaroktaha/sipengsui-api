import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  BerkasTechnicalStatus,
  Prisma,
  RekomtekArtifactStatus,
  RekomtekArtifactType,
  RekomtekAssignmentMemberRole,
  RekomtekExposeMethod,
  RekomtekExposeStatus,
  RekomtekFieldVisitStatus,
  RekomtekFindingStatus,
  RekomtekReviewDecision,
  RekomtekReviewType,
  RekomtekStatus,
  RekomtekWorkflowStage,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { MailService } from '../mail/mail.service';
import { BerkasFileStorageService } from './berkas-file-storage.service';
import { BerkasService } from './berkas.service';
import { WhatsAppOutboxService } from '../whatsapp/whatsapp-outbox.service';
import { WhatsAppConfig } from '../whatsapp/whatsapp.config';
import { normalizeWhatsAppPhone } from '../whatsapp/whatsapp-security';
import {
  AssignRekomtekTeamDto,
  CancelExposeDto,
  CompleteExposeDto,
  CompleteFieldVisitDto,
  CompletePostExposeCorrectionDto,
  CreateArtifactDto,
  CreateCouncilSessionDto,
  EvaluateInitialDto,
  EvaluateInitialRecheckDto,
  ExposeVerificationDto,
  ExternalExposeParticipantDto,
  IssueFieldVisitDto,
  OfficialReviewDto,
  ResolveWorkflowMigrationDto,
  RescheduleExposeDto,
  ScheduleExposeDto,
  SubmitCorrectionDto,
  SuperiorApprovalDto,
  VerifyPostExposeCorrectionDto,
} from './dto/workflow.dto';
import {
  assertWorkflowTransition,
  isApplicantStage,
  projectWorkflowStatus,
  WORKFLOW_STAGE_LABELS,
} from './workflow-state';
import {
  buildRejectionLetterDraft,
  rejectionLetterFileName,
  renderRejectionLetterPdf,
} from './rekomtek-rejection-letter';

const detailInclude = {
  station: true,
  watershed: true,
  riverRegion: true,
  river: true,
  parentRekomtek: {
    select: { id: true, nomor: true, revisionNumber: true, status: true },
  },
  revisions: {
    select: { id: true, nomor: true, revisionNumber: true, status: true },
    orderBy: { revisionNumber: 'asc' as const },
  },
  teamAssignments: {
    include: { members: true },
    orderBy: { createdAt: 'desc' as const },
  },
  reviewRounds: {
    include: { findings: true },
    orderBy: { openedAt: 'asc' as const },
  },
  exposeSchedules: { orderBy: { startsAt: 'asc' as const } },
  fieldVisits: { orderBy: { scheduledStartsAt: 'asc' as const } },
  councilSessions: { orderBy: { completedAt: 'asc' as const } },
  artifacts: {
    orderBy: [{ type: 'asc' as const }, { version: 'asc' as const }],
  },
  workflowEvents: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.RekomtekInclude;

const APPLICANT_OUTPUT_ARTIFACT_TYPES: RekomtekArtifactType[] = [
  RekomtekArtifactType.SURAT_PENOLAKAN,
  RekomtekArtifactType.DOKUMEN_REKOMTEK,
  RekomtekArtifactType.UNDANGAN_EKSPOSE,
];

type WorkflowRecord = {
  id: string;
  workflowStage: RekomtekWorkflowStage | null;
  workflowVersion: number;
  initialCorrectionCount: number;
  status: RekomtekStatus;
  workflowMigrationRequired: boolean;
  createdById: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  approvedDraftArtifactId: string | null;
};

type FindingInput = { berkasId: string; note: string };

type CorrectionResponse = { findingId: string; response: string };

type ExternalExposeParticipant = {
  type: 'EXTERNAL';
  name: string;
  organization: string;
  position?: string;
  email?: string;
  whatsappNumber?: string;
};

function normalizeExternalParticipants(
  values: ExternalExposeParticipantDto[] | undefined,
  defaultCountryCode = '62',
): ExternalExposeParticipant[] {
  const seen = new Set<string>();
  return (values ?? []).map((value) => {
    const name = value.name?.trim() ?? '';
    const organization = value.organization?.trim() ?? '';
    if (!name || !organization) {
      throw new BadRequestException(
        'Nama dan instansi peserta eksternal wajib diisi',
      );
    }

    const duplicateKey = `${name.toLowerCase()}|${organization.toLowerCase()}`;
    if (seen.has(duplicateKey)) {
      throw new BadRequestException(
        'Peserta eksternal yang sama tidak boleh ditambahkan dua kali',
      );
    }
    seen.add(duplicateKey);

    const position = value.position?.trim();
    const email = value.email?.trim();
    let whatsappNumber: string | undefined;
    if (value.whatsappNumber?.trim()) {
      try {
        whatsappNumber = normalizeWhatsAppPhone(
          value.whatsappNumber,
          defaultCountryCode,
        );
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error
            ? `Nomor WhatsApp peserta ${name} tidak valid: ${error.message}`
            : `Nomor WhatsApp peserta ${name} tidak valid`,
        );
      }
    }
    return {
      type: 'EXTERNAL' as const,
      name,
      organization,
      ...(position ? { position } : {}),
      ...(email ? { email } : {}),
      ...(whatsappNumber ? { whatsappNumber } : {}),
    };
  });
}

@Injectable()
export class RekomtekWorkflowService {
  private readonly logger = new Logger(RekomtekWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly berkasService: BerkasService,
    private readonly fileStorage: BerkasFileStorageService,
    private readonly mailService: MailService,
    @Optional() private readonly whatsappConfig?: WhatsAppConfig,
    @Optional() private readonly whatsappOutbox?: WhatsAppOutboxService,
  ) {}

  async getWorkflow(id: string, user: AuthenticatedUser) {
    const current = await this.loadRecord(id);
    await this.assertReadAccess(current, user);
    const detail = await this.prisma.rekomtek.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!detail) return detail;

    const teamAssignments = detail.teamAssignments ?? [];
    const memberUserIds = [
      ...new Set(
        teamAssignments.flatMap((assignment) =>
          assignment.members.map((member) => member.userId),
        ),
      ),
    ];
    const memberUsers =
      memberUserIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: memberUserIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: { select: { name: true } },
              userRoles: { select: { role: { select: { name: true } } } },
            },
          })
        : [];
    const memberUserLabels = new Map(
      memberUsers.map((memberUser) => {
        const roles = [
          memberUser.role?.name,
          ...memberUser.userRoles.map(({ role }) => role.name),
        ].filter(Boolean);
        const displayName = [memberUser.firstName, memberUser.lastName]
          .map((value) => value.trim())
          .filter(Boolean)
          .join(' ');
        const roleName =
          roles.find((role) => role !== 'USER') ?? roles[0] ?? null;
        return [
          memberUser.id,
          {
            displayName: displayName || 'Nama pengguna tidak tersedia',
            roleName,
          },
        ] as const;
      }),
    );
    const detailWithMemberLabels = {
      ...detail,
      teamAssignments: teamAssignments.map((assignment) => ({
        ...assignment,
        members: assignment.members.map((member) => ({
          ...member,
          user: memberUserLabels.get(member.userId) ?? null,
        })),
      })),
    };
    if (
      current.createdById === user.userId &&
      !this.hasRole(user, 'PETUGAS', 'PIMPINAN', 'ADMIN', 'SUPER_ADMIN')
    ) {
      return {
        ...detailWithMemberLabels,
        artifacts: detailWithMemberLabels.artifacts.filter(
          (artifact) =>
            APPLICANT_OUTPUT_ARTIFACT_TYPES.includes(artifact.type) &&
            artifact.status === RekomtekArtifactStatus.FINAL &&
            artifact.technicalStatus === BerkasTechnicalStatus.VALID &&
            (artifact.type !== RekomtekArtifactType.DOKUMEN_REKOMTEK ||
              current.workflowStage ===
                RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT),
        ),
      };
    }
    return detailWithMemberLabels;
  }

  async resolveWorkflowMigration(
    id: string,
    dto: ResolveWorkflowMigrationDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.workflow.migrate');
    this.assertRole(user, 'SUPER_ADMIN', 'ADMIN');
    const legacy = await this.prisma.rekomtek.findUnique({
      where: { id },
      select: {
        id: true,
        workflowStage: true,
        workflowVersion: true,
        workflowMigrationRequired: true,
      },
    });
    if (!legacy)
      throw new NotFoundException('Permohonan Rekomtek tidak ditemukan');
    if (!legacy.workflowMigrationRequired || legacy.workflowStage) {
      throw new BadRequestException(
        'Permohonan Rekomtek ini tidak menunggu pemetaan workflow legacy',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.rekomtek.updateMany({
        where: {
          id,
          workflowStage: null,
          workflowMigrationRequired: true,
          workflowVersion: legacy.workflowVersion,
        },
        data: {
          workflowStage: dto.workflowStage,
          status: projectWorkflowStatus(dto.workflowStage),
          workflowMigrationRequired: false,
          workflowMigrationNote: dto.note.trim(),
          workflowVersion: { increment: 1 },
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException(
          'Record legacy berubah bersamaan; ulangi pemetaan',
        );
      await tx.rekomtekWorkflowEvent.create({
        data: {
          rekomtekId: id,
          fromStage: null,
          toStage: dto.workflowStage,
          action: 'PETAKAN_WORKFLOW_LEGACY',
          actorId: user.userId,
          actorRole: this.primaryRole(user),
          actorPermissions: user.permissions,
          reason: dto.note.trim(),
        },
      });
      return tx.rekomtek.findUnique({ where: { id }, include: detailInclude });
    });
  }

  async findQueue(
    query: {
      stage?: string;
      assignedUserId?: string;
      keyword?: string;
      startDate?: string;
      endDate?: string;
      page: number;
      limit: number;
    },
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.workflow.read');
    const where: Prisma.RekomtekWhereInput = {
      workflowStage: { not: null },
    };

    if (query.stage) {
      if (
        !Object.values(RekomtekWorkflowStage).includes(
          query.stage as RekomtekWorkflowStage,
        )
      ) {
        throw new BadRequestException('Tahap workflow tidak dikenal');
      }
      where.workflowStage = query.stage as RekomtekWorkflowStage;
    }

    const userIsPetugas = this.hasRole(user, 'PETUGAS');
    const userCanSeeAll = this.hasRole(
      user,
      'SUPER_ADMIN',
      'ADMIN',
      'PIMPINAN',
    );
    if (!userIsPetugas && !userCanSeeAll) {
      where.createdById = user.userId;
    }
    const scopedUserId =
      query.assignedUserId ?? (userIsPetugas ? user.userId : undefined);
    if (scopedUserId) {
      where.teamAssignments = {
        some: {
          isActive: true,
          members: {
            some: { userId: scopedUserId, activeUntil: null },
          },
        },
      };
    }

    if (query.keyword?.trim()) {
      const keyword = query.keyword.trim();
      where.OR = [
        { nomor: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
        { judul: { contains: keyword, mode: Prisma.QueryMode.insensitive } },
      ];
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.rekomtek.findMany({
        where,
        select: {
          id: true,
          nomor: true,
          judul: true,
          status: true,
          workflowStage: true,
          initialCorrectionCount: true,
          createdBy: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
          teamAssignments: {
            where: { isActive: true },
            include: { members: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.rekomtek.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getAssignableTeamMembers(user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.assign');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');

    return this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { name: 'PETUGAS' } },
          { userRoles: { some: { role: { name: 'PETUGAS' } } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        organization: true,
        role: { select: { name: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async getOccupiedExposeSlots(user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.expose');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');

    const schedules = await this.prisma.rekomtekExposeSchedule.findMany({
      where: {
        status: {
          in: [RekomtekExposeStatus.DRAFT, RekomtekExposeStatus.TERJADWAL],
        },
      },
      select: { startsAt: true, endsAt: true },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });
    return schedules.map((schedule) => ({
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
    }));
  }

  async getNotifications(user: AuthenticatedUser, unreadOnly = false) {
    return this.prisma.rekomtekNotification.findMany({
      where: {
        recipientId: user.userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markNotificationRead(notificationId: string, user: AuthenticatedUser) {
    const updated = await this.prisma.rekomtekNotification.updateMany({
      where: { id: notificationId, recipientId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (updated.count !== 1)
      throw new NotFoundException('Notifikasi tidak ditemukan');
    return this.prisma.rekomtekNotification.findUnique({
      where: { id: notificationId },
    });
  }

  async submitApplication(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.submit');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.PEMOHON_DRAFT);
    this.assertApplicant(current, user);

    await this.assertChecklistTechnicallyReady(
      id,
      'Semua Berkas Persyaratan wajib tersedia dan lolos validasi teknis sebelum diajukan',
    );
    return this.transition(
      id,
      current,
      RekomtekWorkflowStage.MENUNGGU_PENUNJUKAN_POKJA,
      'AJUKAN_PERMOHONAN',
      user,
    );
  }

  async assignTeam(
    id: string,
    dto: AssignRekomtekTeamDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.assign');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.MENUNGGU_PENUNJUKAN_POKJA);

    const memberIds = [...new Set([...dto.memberIds, dto.coordinatorId])];
    const activeUsers = await this.prisma.user.findMany({
      where: { id: { in: memberIds }, isActive: true },
      select: {
        id: true,
        role: { select: { name: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    if (activeUsers.length !== memberIds.length) {
      throw new BadRequestException(
        'Koordinator dan seluruh anggota Pokja harus akun aktif',
      );
    }
    const nonPetugas = activeUsers.filter(
      (candidate) =>
        candidate.role?.name !== 'PETUGAS' &&
        !candidate.userRoles.some(({ role }) => role.name === 'PETUGAS'),
    );
    if (nonPetugas.length > 0) {
      throw new BadRequestException(
        'Koordinator dan seluruh anggota Pokja harus ber-role PETUGAS',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.rekomtekTeamAssignment.updateMany({
        where: { rekomtekId: id, isActive: true },
        data: { isActive: false, endsAt: new Date() },
      });
      const assignment = await tx.rekomtekTeamAssignment.create({
        data: {
          rekomtekId: id,
          assignedById: user.userId,
          coordinatorId: dto.coordinatorId,
          purpose: dto.purpose.trim(),
          startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
          members: {
            create: memberIds.map((userId) => ({
              userId,
              role:
                userId === dto.coordinatorId
                  ? RekomtekAssignmentMemberRole.KOORDINATOR
                  : RekomtekAssignmentMemberRole.ANGGOTA,
            })),
          },
        },
      });
      const result = await this.transitionInTransaction(
        tx,
        current,
        RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL,
        'TUNJUK_POKJA',
        user,
        undefined,
        { assignmentId: assignment.id },
      );
      return result;
    });
  }

  async evaluateInitial(
    id: string,
    dto: EvaluateInitialDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.evaluate');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL);
    await this.assertPokjaAssigned(id, user);
    const findings = dto.findings ?? [];
    await this.assertFindingItems(id, findings);

    if (dto.decision === 'DIKEMBALIKAN') {
      if (current.initialCorrectionCount !== 0) {
        throw new BadRequestException(
          'Kesempatan Perbaikan Awal hanya dapat diberikan satu kali',
        );
      }
      if (findings.length === 0) {
        throw new BadRequestException(
          'Pengembalian awal wajib memuat temuan per Berkas Persyaratan',
        );
      }
      const validation = await this.berkasService.revalidateRequired(id);
      const requiredFindingIds = new Set([
        ...validation.issues.map((issue) => issue.id),
        ...validation.incomplete.map((item) => item.id),
      ]);
      const findingIds = new Set(findings.map((finding) => finding.berkasId));
      if (
        [...requiredFindingIds].some((berkasId) => !findingIds.has(berkasId))
      ) {
        throw new BadRequestException(
          'Satu paket Perbaikan Awal wajib memuat temuan untuk seluruh Berkas Persyaratan wajib yang belum memenuhi',
        );
      }
    } else {
      await this.assertChecklistReady(
        id,
        'Seluruh Berkas Persyaratan wajib terverifikasi sebelum evaluasi dinyatakan memenuhi',
      );
    }

    const target =
      dto.decision === 'DIKEMBALIKAN'
        ? RekomtekWorkflowStage.PERBAIKAN_AWAL_PEMOHON
        : RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE;
    return this.prisma.$transaction(async (tx) => {
      await this.createReviewRound(
        tx,
        id,
        RekomtekReviewType.EVALUASI_AWAL,
        dto.decision === 'MEMENUHI'
          ? RekomtekReviewDecision.MEMENUHI
          : RekomtekReviewDecision.DIKEMBALIKAN,
        dto.summary,
        findings,
        user,
      );
      return this.transitionInTransaction(
        tx,
        current,
        target,
        dto.decision === 'DIKEMBALIKAN'
          ? 'BERIKAN_PERBAIKAN_AWAL'
          : 'NYATAKAN_MEMENUHI_AWAL',
        user,
        dto.decision === 'DIKEMBALIKAN'
          ? { initialCorrectionCount: { increment: 1 } }
          : undefined,
      );
    });
  }

  async submitInitialCorrection(
    id: string,
    dto: SubmitCorrectionDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.correct.initial');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.PERBAIKAN_AWAL_PEMOHON);
    this.assertApplicant(current, user);
    await this.updateFindingResponsesAndRequireComplete(
      id,
      dto.responses,
      RekomtekReviewType.EVALUASI_AWAL,
      user,
    );
    return this.transition(
      id,
      current,
      RekomtekWorkflowStage.EVALUASI_DOKUMEN_ULANG,
      'AJUKAN_PERBAIKAN_AWAL',
      user,
    );
  }

  async evaluateInitialRecheck(
    id: string,
    dto: EvaluateInitialRecheckDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.evaluate');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.EVALUASI_DOKUMEN_ULANG);
    await this.assertPokjaAssigned(id, user);
    const findings = dto.findings ?? [];
    await this.assertFindingItems(id, findings);
    if (dto.decision === 'MEMENUHI') {
      await this.assertChecklistReady(
        id,
        'Seluruh Berkas Persyaratan wajib valid pada evaluasi ulang',
      );
    } else if (findings.length === 0) {
      throw new BadRequestException(
        'Evaluasi ulang yang tidak memenuhi wajib memuat temuan',
      );
    } else {
      const validation = await this.berkasService.revalidateRequired(id);
      const requiredFindingIds = new Set([
        ...validation.issues.map((issue) => issue.id),
        ...validation.incomplete.map((item) => item.id),
      ]);
      const findingIds = new Set(findings.map((finding) => finding.berkasId));
      if (
        [...requiredFindingIds].some((berkasId) => !findingIds.has(berkasId))
      ) {
        throw new BadRequestException(
          'Evaluasi ulang tidak memenuhi wajib memuat temuan untuk seluruh Berkas Persyaratan wajib yang masih bermasalah',
        );
      }
    }

    const target =
      dto.decision === 'MEMENUHI'
        ? RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE
        : RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN;
    return this.prisma.$transaction(async (tx) => {
      await this.createReviewRound(
        tx,
        id,
        RekomtekReviewType.EVALUASI_ULANG,
        dto.decision === 'MEMENUHI'
          ? RekomtekReviewDecision.MEMENUHI
          : RekomtekReviewDecision.TIDAK_MEMENUHI,
        dto.summary,
        findings,
        user,
      );
      return this.transitionInTransaction(
        tx,
        current,
        target,
        dto.decision === 'MEMENUHI'
          ? 'NYATAKAN_MEMENUHI_ULANG'
          : 'NYATAKAN_TIDAK_MEMENUHI',
        user,
      );
    });
  }

  async issueRejection(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.reject');
    this.assertRole(user, 'PETUGAS', 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN);
    await this.assertPokjaOrOfficialAccess(id, user);
    await this.assertFinalArtifact(id, RekomtekArtifactType.SURAT_PENOLAKAN);
    const result = await this.transition(
      id,
      current,
      RekomtekWorkflowStage.DITOLAK,
      'TERBITKAN_SURAT_PENOLAKAN',
      user,
      {
        reviewedBy: user.userId,
        reviewedAt: new Date(),
      },
    );
    await this.notifyApplicantRejection(id);
    return result;
  }

  async getRejectionLetterDraftPdf(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    this.assertPermission(user, 'rekomtek.read');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN);
    await this.assertReadAccess(current, user);

    const record = await this.prisma.rekomtek.findUnique({
      where: { id },
      select: {
        nomor: true,
        judul: true,
        jenis: true,
        jenisPermohonan: true,
        createdBy: true,
        createdByUser: {
          select: {
            firstName: true,
            lastName: true,
            organization: true,
            address: true,
          },
        },
        reviewRounds: {
          where: { type: RekomtekReviewType.EVALUASI_ULANG },
          orderBy: { roundNumber: 'desc' },
          take: 1,
          select: {
            summary: true,
            findings: {
              orderBy: { createdAt: 'asc' },
              select: {
                note: true,
                rekomtekBerkas: { select: { kode: true, uraian: true } },
              },
            },
          },
        },
      },
    });
    if (!record) {
      throw new NotFoundException('Permohonan Rekomtek tidak ditemukan');
    }

    const applicant = record.createdByUser;
    const applicantName = [applicant?.firstName, applicant?.lastName]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' ')
      .trim();
    const review = record.reviewRounds[0];
    const draft = buildRejectionLetterDraft({
      applicationNumber: record.nomor,
      applicationTitle: record.judul,
      applicationType: `${record.jenis} / ${record.jenisPermohonan}`,
      applicantName: applicantName || record.createdBy,
      applicantOrganization: applicant?.organization,
      applicantAddress: applicant?.address,
      evaluationSummary: review?.summary,
      findings: (review?.findings ?? []).map((finding) => ({
        requirement: finding.rekomtekBerkas
          ? `${finding.rekomtekBerkas.kode} ${finding.rekomtekBerkas.uraian}`
          : 'Berkas Persyaratan',
        note: finding.note,
      })),
    });

    const buffer = await renderRejectionLetterPdf(draft);
    if (buffer.length === 0) {
      throw new InternalServerErrorException(
        'Draft Surat Penolakan gagal dibuat karena tidak memiliki isi',
      );
    }
    return { buffer, fileName: rejectionLetterFileName(record.nomor) };
  }

  async uploadArtifact(
    id: string,
    dto: CreateArtifactDto,
    file: Express.Multer.File,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.artifact');
    const current = await this.loadRecord(id);
    const currentStage = current.workflowStage;
    if (!currentStage)
      throw new ConflictException('Tahap workflow belum dipetakan oleh admin');
    await this.assertPokjaOrOfficialAccess(id, user);
    this.assertArtifactAllowedAtStage(dto.type, currentStage);

    const stored = await this.fileStorage.stage(file, {
      allowedMimeTypes: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ],
      maxFileSize: 25 * 1024 * 1024,
    });
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const metadata = this.parseJson(dto.metadata);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const version =
          (
            await tx.rekomtekArtifact.aggregate({
              where: { rekomtekId: id, type: dto.type },
              _max: { version: true },
            })
          )._max.version ?? 0;
        const artifact = await tx.rekomtekArtifact.create({
          data: {
            rekomtekId: id,
            type: dto.type,
            version: version + 1,
            fileName: file.originalname || `${dto.type.toLowerCase()}.bin`,
            storageKey: stored.storageKey,
            mimeType: stored.mimeType,
            fileSize: stored.size,
            checksum,
            technicalStatus: stored.technicalStatus,
            stage: currentStage,
            status: RekomtekArtifactStatus.DRAFT,
            sourceArtifactId: dto.sourceArtifactId,
            createdById: user.userId,
            metadata,
          },
        });
        await tx.rekomtekWorkflowEvent.create({
          data: {
            rekomtekId: id,
            fromStage: current.workflowStage,
            toStage: current.workflowStage!,
            action: 'UPLOAD_ARTEFAK',
            actorId: user.userId,
            actorRole: this.primaryRole(user),
            actorPermissions: user.permissions,
            metadata: {
              artifactId: artifact.id,
              type: artifact.type,
              version: artifact.version,
            },
          },
        });
        return artifact;
      });
    } catch (error) {
      await this.fileStorage.remove(stored.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async finalizeArtifact(
    id: string,
    artifactId: string,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.artifact');
    const current = await this.loadRecord(id);
    await this.assertPokjaOrOfficialAccess(id, user);
    const artifact = await this.prisma.rekomtekArtifact.findFirst({
      where: { id: artifactId, rekomtekId: id },
    });
    if (!artifact)
      throw new NotFoundException('Artefak proses tidak ditemukan');
    if (artifact.status === RekomtekArtifactStatus.FINAL) return artifact;
    if (artifact.stage !== current.workflowStage) {
      throw new ConflictException(
        'Artefak berasal dari tahap workflow yang berbeda; periksa ulang sebelum finalisasi',
      );
    }
    const validation = await this.fileStorage.revalidate(artifact.storageKey);
    if (validation.technicalStatus !== BerkasTechnicalStatus.VALID) {
      await this.prisma.rekomtekArtifact.update({
        where: { id: artifactId },
        data: {
          technicalStatus: validation.technicalStatus,
          storageKey: validation.storageKey,
        },
      });
      throw new BadRequestException(
        'Artefak harus lolos validasi teknis sebelum difinalkan',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rekomtekArtifact.updateMany({
        where: { id: artifactId, status: RekomtekArtifactStatus.DRAFT },
        data: {
          status: RekomtekArtifactStatus.FINAL,
          technicalStatus: BerkasTechnicalStatus.VALID,
          storageKey: validation.storageKey,
          finalizedById: user.userId,
          finalizedAt: new Date(),
        },
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Artefak berubah bersamaan; ulangi finalisasi',
        );
      await tx.rekomtekWorkflowEvent.create({
        data: {
          rekomtekId: id,
          fromStage: current.workflowStage,
          toStage: current.workflowStage!,
          action: 'FINALISASI_ARTEFAK',
          actorId: user.userId,
          actorRole: this.primaryRole(user),
          actorPermissions: user.permissions,
          metadata: {
            artifactId,
            type: artifact.type,
            version: artifact.version,
          },
        },
      });
      return tx.rekomtekArtifact.findUnique({ where: { id: artifactId } });
    });
  }

  async getArtifactFile(
    id: string,
    artifactId: string,
    user: AuthenticatedUser,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    size: number;
    mimeType: string;
    fileName: string;
  }> {
    this.assertPermission(user, 'rekomtek.read');
    const current = await this.loadRecord(id);
    const artifact = await this.prisma.rekomtekArtifact.findFirst({
      where: {
        id: artifactId,
        rekomtekId: id,
        status: RekomtekArtifactStatus.FINAL,
        technicalStatus: BerkasTechnicalStatus.VALID,
      },
    });
    if (!artifact) throw new NotFoundException('Artefak final tidak ditemukan');
    if (
      artifact.type === RekomtekArtifactType.DOKUMEN_REKOMTEK &&
      current.workflowStage !== RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT
    ) {
      throw new NotFoundException(
        'Dokumen Rekomtek belum diterbitkan untuk Pemohon',
      );
    }
    if (artifact.type === RekomtekArtifactType.UNDANGAN_EKSPOSE) {
      await this.assertExposeInvitationAccess(id, artifact.id, current, user);
    } else {
      await this.assertReadAccess(current, user);
      if (
        user.userId === current.createdById &&
        !APPLICANT_OUTPUT_ARTIFACT_TYPES.includes(artifact.type)
      ) {
        throw new ForbiddenException(
          'Pemohon hanya dapat mengunduh dokumen hasil final',
        );
      }
    }
    if (!artifact.storageKey.startsWith('active/')) {
      throw new ForbiddenException('Artefak belum berada pada storage aktif');
    }
    const file = await this.fileStorage.getFile(artifact.storageKey);
    return {
      ...file,
      mimeType: artifact.mimeType,
      fileName: artifact.fileName,
    };
  }

  private async assertExposeInvitationAccess(
    rekomtekId: string,
    artifactId: string,
    current: WorkflowRecord,
    user: AuthenticatedUser,
  ): Promise<void> {
    const schedule = await this.prisma.rekomtekExposeSchedule.findFirst({
      where: { rekomtekId, invitationArtifactId: artifactId },
      select: { participants: true, responsibleUserId: true },
    });
    if (!schedule) {
      throw new NotFoundException('Undangan Ekspose tidak ditemukan');
    }
    if (current.createdById === user.userId) return;
    const participantIds = new Set<string>([schedule.responsibleUserId]);
    if (Array.isArray(schedule.participants)) {
      for (const participant of schedule.participants) {
        if (typeof participant === 'string') participantIds.add(participant);
      }
    }
    if (!participantIds.has(user.userId)) {
      throw new ForbiddenException(
        'Anda bukan Pemohon atau peserta Undangan Ekspose ini',
      );
    }
    if (this.hasRole(user, 'PETUGAS')) {
      await this.assertPokjaAssigned(current.id, user);
    }
  }

  async scheduleExpose(
    id: string,
    dto: ScheduleExposeDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.expose');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE);
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertEndAfterStart(startsAt, endsAt, 'Jadwal Ekspose');
    if (
      (dto.method === RekomtekExposeMethod.LURING ||
        dto.method === RekomtekExposeMethod.HIBRID) &&
      !dto.venue?.trim()
    ) {
      throw new BadRequestException(
        'Tempat wajib diisi untuk metode LURING atau HIBRID',
      );
    }
    if (
      (dto.method === RekomtekExposeMethod.DARING ||
        dto.method === RekomtekExposeMethod.HIBRID) &&
      !dto.meetingUrl?.trim()
    ) {
      throw new BadRequestException(
        'Tautan rapat wajib diisi untuk metode DARING atau HIBRID',
      );
    }
    const participants = [...new Set(dto.participantIds)];
    const externalParticipants = normalizeExternalParticipants(
      dto.externalParticipants,
      this.whatsappConfig?.defaultCountryCode ?? '62',
    );
    const participantRecords = [
      ...participants,
      ...externalParticipants,
    ] as Prisma.InputJsonValue;
    if (participants.length < 3)
      throw new BadRequestException(
        'Peserta Ekspose minimal Pemohon, Pejabat Rekomtek, dan Pokja',
      );
    await this.assertActiveUser(dto.responsibleUserId);
    await this.assertFinalArtifact(
      id,
      RekomtekArtifactType.UNDANGAN_EKSPOSE,
      dto.invitationArtifactId,
    );

    const activeAssignment = await this.prisma.rekomtekTeamAssignment.findFirst(
      {
        where: { rekomtekId: id, isActive: true },
        include: { members: { select: { userId: true } } },
      },
    );
    const participantUsers = await this.prisma.user.findMany({
      where: { id: { in: participants }, isActive: true },
      select: {
        id: true,
        role: { select: { name: true } },
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    if (participantUsers.length !== participants.length) {
      throw new BadRequestException(
        'Seluruh peserta Ekspose harus merupakan akun aktif',
      );
    }
    const hasApplicant = Boolean(
      current.createdById && participants.includes(current.createdById),
    );
    const hasOfficial = participantUsers.some(
      (participant) =>
        participant.role?.name === 'PIMPINAN' ||
        participant.userRoles.some(({ role }) => role.name === 'PIMPINAN'),
    );
    const pokjaUserIds = [
      dto.responsibleUserId,
      ...(activeAssignment?.members.map((member) => member.userId) ?? []),
    ];
    const hasPokja = participants.some((participantId) =>
      pokjaUserIds.includes(participantId),
    );
    if (!hasApplicant || !hasOfficial || !hasPokja) {
      throw new BadRequestException(
        'Daftar peserta wajib memuat Pemohon, Pejabat Rekomtek, dan Pokja aktif',
      );
    }

    const exactSlot = await this.prisma.rekomtekExposeSchedule.findFirst({
      where: {
        startsAt,
        status: {
          in: [RekomtekExposeStatus.DRAFT, RekomtekExposeStatus.TERJADWAL],
        },
      },
      select: { id: true },
    });
    if (exactSlot) {
      throw new ConflictException(
        'Slot jadwal Ekspose pada tanggal dan waktu mulai tersebut sudah digunakan. Pilih waktu lain.',
      );
    }

    const conflictWhere: Prisma.RekomtekExposeScheduleWhereInput = {
      status: {
        in: [RekomtekExposeStatus.DRAFT, RekomtekExposeStatus.TERJADWAL],
      },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    };
    const conflictCandidates =
      await this.prisma.rekomtekExposeSchedule.findMany({
        where: conflictWhere,
        select: {
          id: true,
          rekomtekId: true,
          startsAt: true,
          endsAt: true,
          venue: true,
          responsibleUserId: true,
          participants: true,
        },
        take: 10,
      });
    const conflicts = conflictCandidates.filter((conflict) => {
      const scheduledParticipants = Array.isArray(conflict.participants)
        ? conflict.participants.filter(
            (participant): participant is string =>
              typeof participant === 'string',
          )
        : [];
      return (
        pokjaUserIds.includes(conflict.responsibleUserId) ||
        (Boolean(dto.venue?.trim()) && conflict.venue === dto.venue?.trim()) ||
        scheduledParticipants.some((participantId) =>
          pokjaUserIds.includes(participantId),
        )
      );
    });
    const warnings = conflicts.map((conflict) => ({
      code:
        conflict.venue === dto.venue?.trim()
          ? 'VENUE_CONFLICT'
          : 'RESPONSIBLE_CONFLICT',
      scheduleId: conflict.id,
      rekomtekId: conflict.rekomtekId,
      message:
        'Benturan jadwal terdeteksi untuk penanggung jawab atau tempat yang sama.',
    }));

    let schedule: Awaited<
      ReturnType<RekomtekWorkflowService['transitionInTransaction']>
    >;
    try {
      schedule = await this.prisma.$transaction(async (tx) => {
        const createdSchedule = await tx.rekomtekExposeSchedule.create({
          data: {
            rekomtekId: id,
            startsAt,
            endsAt,
            method: dto.method,
            venue: dto.venue?.trim() || null,
            meetingUrl: dto.meetingUrl?.trim() || null,
            agenda: dto.agenda.trim(),
            participants: participantRecords,
            responsibleUserId: dto.responsibleUserId,
            invitationNumber: dto.invitationNumber.trim(),
            invitationArtifactId: dto.invitationArtifactId,
            status: RekomtekExposeStatus.TERJADWAL,
            createdById: user.userId,
          },
        });
        return this.transitionInTransaction(
          tx,
          current,
          RekomtekWorkflowStage.EKSPOSE_TERJADWAL,
          'JADWALKAN_EKSPOSE',
          user,
          undefined,
          {
            scheduleId: createdSchedule.id,
            scheduleVersion: createdSchedule.scheduleVersion,
            invitationArtifactId: dto.invitationArtifactId,
            warnings,
          },
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Slot jadwal Ekspose pada tanggal dan waktu mulai tersebut sudah digunakan. Pilih waktu lain.',
        );
      }
      throw error;
    }
    return { ...schedule, warnings };
  }

  async rescheduleExpose(
    id: string,
    scheduleId: string,
    dto: RescheduleExposeDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.expose');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.EKSPOSE_TERJADWAL);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertEndAfterStart(startsAt, endsAt, 'Jadwal Ekspose baru');
    const schedule = await this.prisma.rekomtekExposeSchedule.findFirst({
      where: {
        id: scheduleId,
        rekomtekId: id,
        status: RekomtekExposeStatus.TERJADWAL,
      },
      select: {
        id: true,
        rekomtekId: true,
        startsAt: true,
        endsAt: true,
        scheduleVersion: true,
        status: true,
        invitationArtifactId: true,
      },
    });
    if (!schedule) {
      throw new NotFoundException('Jadwal Ekspose terjadwal tidak ditemukan');
    }
    if (schedule.invitationArtifactId === dto.invitationArtifactId) {
      throw new BadRequestException(
        'Reschedule wajib menggunakan artefak Undangan Ekspose versi baru',
      );
    }
    const invitationArtifact = await this.assertFinalArtifact(
      id,
      RekomtekArtifactType.UNDANGAN_EKSPOSE,
      dto.invitationArtifactId,
    );
    if (invitationArtifact.stage !== current.workflowStage) {
      throw new BadRequestException(
        'Artefak Undangan Ekspose versi baru harus dibuat pada tahap reschedule saat ini',
      );
    }
    const reason = dto.reason?.trim() || undefined;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rekomtekExposeSchedule.updateMany({
        where: {
          id: scheduleId,
          rekomtekId: id,
          status: RekomtekExposeStatus.TERJADWAL,
          scheduleVersion: schedule.scheduleVersion,
        },
        data: {
          startsAt,
          endsAt,
          invitationArtifactId: dto.invitationArtifactId,
          scheduleVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Jadwal Ekspose berubah bersamaan; muat ulang dan ulangi perubahan',
        );
      }
      const event = await tx.rekomtekWorkflowEvent.create({
        data: {
          rekomtekId: id,
          fromStage: current.workflowStage!,
          toStage: current.workflowStage!,
          action: 'RESCHEDULE_EKSPOSE',
          actorId: user.userId,
          actorRole: this.primaryRole(user),
          actorPermissions: user.permissions,
          reason,
          metadata: {
            scheduleId,
            previousStartsAt: schedule.startsAt.toISOString(),
            previousEndsAt: schedule.endsAt.toISOString(),
            previousInvitationArtifactId: schedule.invitationArtifactId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            invitationArtifactId: dto.invitationArtifactId,
            scheduleVersion: schedule.scheduleVersion + 1,
          },
        },
      });
      if (this.whatsappOutbox) {
        await this.whatsappOutbox.enqueueExposeRescheduled(tx, {
          scheduleId,
          eventId: event.id,
        });
      }
      return tx.rekomtekExposeSchedule.findUnique({
        where: { id: scheduleId },
      });
    });
  }

  async cancelExpose(
    id: string,
    scheduleId: string,
    dto: CancelExposeDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.expose');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.EKSPOSE_TERJADWAL);
    const reason = dto.reason.trim();
    const schedule = await this.prisma.rekomtekExposeSchedule.findFirst({
      where: {
        id: scheduleId,
        rekomtekId: id,
        status: RekomtekExposeStatus.TERJADWAL,
      },
      select: { id: true, scheduleVersion: true, status: true },
    });
    if (!schedule) {
      throw new NotFoundException('Jadwal Ekspose terjadwal tidak ditemukan');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rekomtekExposeSchedule.updateMany({
        where: {
          id: scheduleId,
          rekomtekId: id,
          status: RekomtekExposeStatus.TERJADWAL,
          scheduleVersion: schedule.scheduleVersion,
        },
        data: {
          status: RekomtekExposeStatus.DIBATALKAN,
          cancellationReason: reason,
          scheduleVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Jadwal Ekspose berubah bersamaan; muat ulang dan ulangi pembatalan',
        );
      }
      return this.transitionInTransaction(
        tx,
        current,
        RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE,
        'BATALKAN_EKSPOSE',
        user,
        undefined,
        {
          scheduleId,
          scheduleVersion: schedule.scheduleVersion + 1,
        },
        reason,
      );
    });
  }

  async completeExpose(
    id: string,
    scheduleId: string,
    dto: CompleteExposeDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.expose');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.EKSPOSE_TERJADWAL);
    await this.assertPokjaAssigned(id, user);
    const actualStartsAt = new Date(dto.actualStartsAt);
    const actualEndsAt = new Date(dto.actualEndsAt);
    this.assertEndAfterStart(actualStartsAt, actualEndsAt, 'Realisasi Ekspose');
    const schedule = await this.prisma.rekomtekExposeSchedule.findFirst({
      where: {
        id: scheduleId,
        rekomtekId: id,
        status: RekomtekExposeStatus.TERJADWAL,
      },
    });
    if (!schedule)
      throw new NotFoundException('Jadwal Ekspose terjadwal tidak ditemukan');
    return this.prisma.$transaction(async (tx) => {
      await tx.rekomtekExposeSchedule.update({
        where: { id: scheduleId },
        data: {
          status: RekomtekExposeStatus.SELESAI,
          actualStartsAt,
          actualEndsAt,
          notes: dto.notes?.trim() || null,
        },
      });
      return this.transitionInTransaction(
        tx,
        current,
        RekomtekWorkflowStage.MENUNGGU_BA_EKSPOSE,
        'SELESAIKAN_EKSPOSE',
        user,
      );
    });
  }

  async openExposeVerification(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.expose');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.MENUNGGU_BA_EKSPOSE);
    await this.assertPokjaAssigned(id, user);
    await this.assertFinalArtifact(
      id,
      RekomtekArtifactType.BERITA_ACARA_EKSPOSE,
    );
    return this.transition(
      id,
      current,
      RekomtekWorkflowStage.VERIFIKASI_HASIL_EKSPOSE,
      'AJUKAN_BA_EKSPOSE_KE_VERIFIKASI',
      user,
    );
  }

  async verifyExpose(
    id: string,
    dto: ExposeVerificationDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.expose');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.VERIFIKASI_HASIL_EKSPOSE);
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    await this.assertFinalArtifact(
      id,
      RekomtekArtifactType.BERITA_ACARA_EKSPOSE,
    );
    const findings = dto.findings ?? [];
    await this.assertFindingItems(id, findings);
    if (dto.decision === 'LENGKAP' && findings.length > 0)
      throw new BadRequestException(
        'Keputusan lanjut ke SPT tidak boleh memuat temuan revisi',
      );
    if (dto.decision === 'KURANG' && findings.length === 0)
      throw new BadRequestException(
        'Kekurangan pasca-Ekspose wajib menunjuk Berkas Persyaratan',
      );
    const target =
      dto.decision === 'LENGKAP'
        ? RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN
        : RekomtekWorkflowStage.PERBAIKAN_PASCA_EKSPOSE;
    return this.prisma.$transaction(async (tx) => {
      if (findings.length > 0) {
        await this.createReviewRound(
          tx,
          id,
          RekomtekReviewType.PASCA_EKSPOSE,
          dto.decision === 'LENGKAP'
            ? RekomtekReviewDecision.MEMENUHI
            : RekomtekReviewDecision.DIKEMBALIKAN,
          dto.summary,
          findings,
          user,
        );
      }
      return this.transitionInTransaction(
        tx,
        current,
        target,
        dto.decision === 'LENGKAP'
          ? 'VERIFIKASI_EKSPOSE_LENGKAP'
          : 'CATAT_KEKURANGAN_PASCA_EKSPOSE',
        user,
      );
    });
  }

  async submitPostExposeCorrection(
    id: string,
    dto: CompletePostExposeCorrectionDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.correct.post-expose');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.PERBAIKAN_PASCA_EKSPOSE);
    this.assertApplicant(current, user);
    await this.updateFindingResponsesAndRequireComplete(
      id,
      dto.responses,
      RekomtekReviewType.PASCA_EKSPOSE,
      user,
      false,
    );
    return this.transition(
      id,
      current,
      RekomtekWorkflowStage.VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE,
      'AJUKAN_PELENGKAPAN_PASCA_EKSPOSE',
      user,
    );
  }

  async verifyPostExposeCorrection(
    id: string,
    dto: VerifyPostExposeCorrectionDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.evaluate');
    const current = await this.loadRecord(id);
    this.assertStage(
      current,
      RekomtekWorkflowStage.VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE,
    );
    await this.assertPokjaAssigned(id, user);
    const unansweredFindings = await this.prisma.rekomtekReviewFinding.count({
      where: {
        reviewRound: { rekomtekId: id, type: RekomtekReviewType.PASCA_EKSPOSE },
        status: RekomtekFindingStatus.TERBUKA,
      },
    });
    if (dto.decision === 'LENGKAP' && unansweredFindings > 0)
      throw new BadRequestException(
        'Seluruh temuan pasca-Ekspose harus dijawab Pemohon sebelum dinyatakan lengkap',
      );
    if (dto.decision === 'LANJUT_PERBAIKAN' && !dto.summary?.trim())
      throw new BadRequestException(
        'Alasan pelengkapan lanjutan wajib dicatat',
      );
    if (dto.decision === 'LENGKAP') {
      await this.assertChecklistReady(
        id,
        'Seluruh Berkas Persyaratan hasil revisi harus valid dan terverifikasi sebelum lanjut ke SPT Lapangan',
      );
    }
    const target =
      dto.decision === 'LENGKAP'
        ? RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN
        : RekomtekWorkflowStage.PERBAIKAN_PASCA_EKSPOSE;
    return this.prisma.$transaction(async (tx) => {
      if (dto.decision === 'LENGKAP') {
        await tx.rekomtekReviewFinding.updateMany({
          where: {
            reviewRound: {
              rekomtekId: id,
              type: RekomtekReviewType.PASCA_EKSPOSE,
            },
            status: RekomtekFindingStatus.TERJAWAB,
          },
          data: {
            status: RekomtekFindingStatus.DITUTUP,
            resolvedById: user.userId,
            resolvedAt: new Date(),
          },
        });
      } else {
        await tx.rekomtekReviewFinding.updateMany({
          where: {
            reviewRound: {
              rekomtekId: id,
              type: RekomtekReviewType.PASCA_EKSPOSE,
            },
            status: RekomtekFindingStatus.TERJAWAB,
          },
          data: {
            status: RekomtekFindingStatus.TERBUKA,
            applicantResponse: null,
          },
        });
      }
      return this.transitionInTransaction(
        tx,
        current,
        target,
        dto.decision === 'LENGKAP'
          ? 'VERIFIKASI_PELENGKAPAN_LENGKAP'
          : 'MINTA_PELENGKAPAN_LANJUTAN',
        user,
        undefined,
        dto.summary,
      );
    });
  }

  async issueFieldVisit(
    id: string,
    dto: IssueFieldVisitDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.field');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN);
    const startsAt = new Date(dto.scheduledStartsAt);
    const endsAt = new Date(dto.scheduledEndsAt);
    this.assertEndAfterStart(startsAt, endsAt, 'Jadwal Kunjungan Lapangan');
    await this.assertActiveUser(dto.petugasId);
    await this.assertPokjaMember(id, dto.petugasId);
    await this.assertFinalArtifact(
      id,
      RekomtekArtifactType.SPT_LAPANGAN,
      dto.artifactId,
    );
    return this.prisma.$transaction(async (tx) => {
      const visit = await tx.rekomtekFieldVisit.create({
        data: {
          rekomtekId: id,
          sptNumber: dto.sptNumber.trim(),
          issuedAt: new Date(dto.issuedAt),
          petugasId: dto.petugasId,
          location: dto.location.trim(),
          scheduledStartsAt: startsAt,
          scheduledEndsAt: endsAt,
          scope: dto.scope.trim(),
          artifactId: dto.artifactId,
          createdById: user.userId,
        },
      });
      return this.transitionInTransaction(
        tx,
        current,
        RekomtekWorkflowStage.KUNJUNGAN_LAPANGAN_DITUGASKAN,
        'TERBITKAN_SPT_LAPANGAN',
        user,
        undefined,
        { fieldVisitId: visit.id },
      );
    });
  }

  async completeFieldVisit(
    id: string,
    visitId: string,
    dto: CompleteFieldVisitDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.field');
    const current = await this.loadRecord(id);
    this.assertStage(
      current,
      RekomtekWorkflowStage.KUNJUNGAN_LAPANGAN_DITUGASKAN,
    );
    const visit = await this.prisma.rekomtekFieldVisit.findFirst({
      where: {
        id: visitId,
        rekomtekId: id,
        status: RekomtekFieldVisitStatus.DITUGASKAN,
      },
    });
    if (!visit)
      throw new NotFoundException('Tugas Kunjungan Lapangan tidak ditemukan');
    if (visit.petugasId !== user.userId) {
      throw new ForbiddenException(
        'Hanya PIC Tim Pokja yang dapat mencatat realisasi Kunjungan Lapangan',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.rekomtekFieldVisit.update({
        where: { id: visitId },
        data: {
          status: RekomtekFieldVisitStatus.SELESAI,
          realizedAt: new Date(dto.realizedAt),
          realizationNotes: dto.realizationNotes.trim(),
        },
      });
      return this.transitionInTransaction(
        tx,
        current,
        RekomtekWorkflowStage.MENUNGGU_BA_LAPANGAN,
        'SELESAIKAN_KUNJUNGAN_LAPANGAN',
        user,
      );
    });
  }

  async verifyFieldArtifact(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.field');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.MENUNGGU_BA_LAPANGAN);
    await this.assertPokjaAssigned(id, user);
    const visit = await this.prisma.rekomtekFieldVisit.findFirst({
      where: { rekomtekId: id, status: RekomtekFieldVisitStatus.SELESAI },
    });
    if (!visit)
      throw new BadRequestException(
        'Realisasi Kunjungan Lapangan belum tercatat',
      );
    await this.assertFinalArtifact(
      id,
      RekomtekArtifactType.BERITA_ACARA_LAPANGAN,
    );
    return this.transition(
      id,
      current,
      RekomtekWorkflowStage.PERSIAPAN_SIDANG_REKOMTEK,
      'VERIFIKASI_BA_LAPANGAN',
      user,
    );
  }

  async createCouncilSession(
    id: string,
    dto: CreateCouncilSessionDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.council');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.PERSIAPAN_SIDANG_REKOMTEK);
    await this.assertPokjaAssigned(id, user);
    const scheduledAt = new Date(dto.scheduledAt);
    const completedAt = new Date(dto.completedAt);
    this.assertEndAfterStart(scheduledAt, completedAt, 'Sidang Rekomtek');
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.rekomtekCouncilSession.create({
        data: {
          rekomtekId: id,
          scheduledAt,
          completedAt,
          participants: dto.participantIds,
          decision: dto.decision.trim(),
          notes: dto.notes?.trim() || null,
          createdById: user.userId,
        },
      });
      return this.transitionInTransaction(
        tx,
        current,
        RekomtekWorkflowStage.MENUNGGU_BA_SIDANG_REKOMTEK,
        'LAKSANAKAN_SIDANG_REKOMTEK',
        user,
        undefined,
        { councilSessionId: session.id },
      );
    });
  }

  async openResultPreparation(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.draft');
    const current = await this.loadRecord(id);
    this.assertStage(
      current,
      RekomtekWorkflowStage.MENUNGGU_BA_SIDANG_REKOMTEK,
    );
    await this.assertPokjaAssigned(id, user);
    await this.assertFinalArtifact(
      id,
      RekomtekArtifactType.BERITA_ACARA_SIDANG_REKOMTEK,
    );
    return this.transition(
      id,
      current,
      RekomtekWorkflowStage.PENYUSUNAN_HASIL_REKOMTEK,
      'BUKA_PENYUSUNAN_HASIL_REKOMTEK',
      user,
    );
  }

  async prepareResult(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.draft');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.PENYUSUNAN_HASIL_REKOMTEK);
    await this.assertPokjaAssigned(id, user);
    await this.assertFinalArtifact(id, RekomtekArtifactType.SURAT_PERSETUJUAN);
    await this.assertFinalArtifact(id, RekomtekArtifactType.DRAFT_REKOMTEK);
    return this.transition(
      id,
      current,
      RekomtekWorkflowStage.PEMERIKSAAN_PEJABAT,
      'AJUKAN_HASIL_KE_PEMERIKSAAN_PEJABAT',
      user,
    );
  }

  async officialReview(
    id: string,
    dto: OfficialReviewDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.inspect');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.PEMERIKSAAN_PEJABAT);
    if (dto.decision === 'KEMBALIKAN' && !dto.note?.trim())
      throw new BadRequestException(
        'Catatan pemeriksaan wajib diisi ketika hasil dikembalikan',
      );
    if (dto.decision === 'TERUSKAN') {
      await this.assertFinalArtifact(
        id,
        RekomtekArtifactType.SURAT_PERSETUJUAN,
      );
      await this.assertFinalArtifact(id, RekomtekArtifactType.DRAFT_REKOMTEK);
    }
    const target =
      dto.decision === 'KEMBALIKAN'
        ? RekomtekWorkflowStage.PENYUSUNAN_HASIL_REKOMTEK
        : RekomtekWorkflowStage.MENUNGGU_PERSETUJUAN_ATASAN;
    return this.transition(
      id,
      current,
      target,
      dto.decision === 'KEMBALIKAN'
        ? 'KEMBALIKAN_HASIL_OLEH_PEJABAT'
        : 'TERUSKAN_KE_ATASAN',
      user,
      { reviewedBy: user.userId, reviewedAt: new Date() },
      dto.note,
    );
  }

  async superiorApproval(
    id: string,
    dto: SuperiorApprovalDto,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.approve.final');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const current = await this.loadRecord(id);
    this.assertStage(
      current,
      RekomtekWorkflowStage.MENUNGGU_PERSETUJUAN_ATASAN,
    );
    if (current.reviewedBy === user.userId)
      throw new ForbiddenException(
        'Pejabat pemeriksa dan Atasan Pejabat harus merupakan akun berbeda',
      );
    if (dto.decision === 'KEMBALIKAN' && !dto.note?.trim())
      throw new BadRequestException(
        'Catatan persetujuan wajib diisi ketika hasil dikembalikan',
      );
    const target =
      dto.decision === 'KEMBALIKAN'
        ? RekomtekWorkflowStage.PENYUSUNAN_HASIL_REKOMTEK
        : RekomtekWorkflowStage.DISETUJUI_ATASAN;
    let approvedDraftArtifactId: string | undefined;
    if (dto.decision === 'SETUJUI') {
      const draft = await this.assertFinalArtifact(
        id,
        RekomtekArtifactType.DRAFT_REKOMTEK,
      );
      approvedDraftArtifactId = draft.id;
    }
    return this.transition(
      id,
      current,
      target,
      dto.decision === 'KEMBALIKAN'
        ? 'KEMBALIKAN_OLEH_ATASAN'
        : 'SETUJUI_OLEH_ATASAN',
      user,
      dto.decision === 'SETUJUI'
        ? {
            approvedBy: user.userId,
            approvedAt: new Date(),
            approvedDraftArtifactId,
          }
        : undefined,
      dto.note,
    );
  }

  async publishFinal(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.publish.final');
    this.assertRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.DISETUJUI_ATASAN);
    const finalArtifact = await this.assertFinalArtifact(
      id,
      RekomtekArtifactType.DOKUMEN_REKOMTEK,
    );
    if (
      !current.approvedDraftArtifactId ||
      finalArtifact.sourceArtifactId !== current.approvedDraftArtifactId
    ) {
      throw new BadRequestException(
        'Dokumen Rekomtek final harus terkait dengan versi draft yang disetujui Atasan Pejabat',
      );
    }
    return this.transition(
      id,
      current,
      RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT,
      'TERBITKAN_DOKUMEN_REKOMTEK',
      user,
      {
        approvedBy: current.approvedBy ?? user.userId,
        approvedAt: current.approvedAt ?? new Date(),
        publishedAt: new Date(),
        publishedArtifactId: finalArtifact.id,
        fileUrl: finalArtifact.storageKey,
      },
    );
  }

  async legacyApprove(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.evaluate');
    const current = await this.loadRecord(id);
    if (current.workflowStage === RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL) {
      return this.evaluateInitial(id, { decision: 'MEMENUHI' }, user);
    }
    if (current.workflowStage === RekomtekWorkflowStage.PEMERIKSAAN_PEJABAT) {
      return this.officialReview(id, { decision: 'TERUSKAN' }, user);
    }
    if (
      current.workflowStage ===
      RekomtekWorkflowStage.MENUNGGU_PERSETUJUAN_ATASAN
    ) {
      return this.superiorApproval(id, { decision: 'SETUJUI' }, user);
    }
    throw new BadRequestException(
      'Endpoint approval lama tidak sesuai dengan tahap workflow saat ini; gunakan aksi tahap yang tersedia',
    );
  }

  async legacyReject(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.reject');
    const current = await this.loadRecord(id);
    if (
      current.workflowStage === RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN
    ) {
      return this.issueRejection(id, user);
    }
    throw new BadRequestException(
      'Penolakan hanya dapat dilakukan setelah Evaluasi Dokumen Ulang tidak memenuhi dan Surat Penolakan final tersedia',
    );
  }

  async legacyPublish(id: string, user: AuthenticatedUser) {
    this.assertPermission(user, 'rekomtek.publish.final');
    return this.publishFinal(id, user);
  }

  async legacyReturnInitial(
    id: string,
    berkasId: string,
    revisionNote: string,
    user: AuthenticatedUser,
  ) {
    this.assertPermission(user, 'rekomtek.evaluate');
    const current = await this.loadRecord(id);
    this.assertStage(current, RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL);
    await this.assertPokjaAssigned(id, user);
    return this.evaluateInitial(
      id,
      {
        decision: 'DIKEMBALIKAN',
        findings: [{ berkasId, note: revisionNote }],
      },
      user,
    );
  }

  private async loadRecord(id: string): Promise<WorkflowRecord> {
    const record = await this.prisma.rekomtek.findUnique({
      where: { id },
      select: {
        id: true,
        workflowStage: true,
        workflowVersion: true,
        initialCorrectionCount: true,
        status: true,
        workflowMigrationRequired: true,
        createdById: true,
        reviewedBy: true,
        approvedBy: true,
        approvedAt: true,
        approvedDraftArtifactId: true,
      },
    });
    if (!record)
      throw new NotFoundException('Permohonan Rekomtek tidak ditemukan');
    if (record.workflowMigrationRequired || !record.workflowStage) {
      throw new ConflictException(
        'Permohonan Rekomtek legacy belum dipetakan ke tahap workflow; minta admin menyelesaikan migrasi',
      );
    }
    return record;
  }

  private async assertReadAccess(
    record: WorkflowRecord,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (
      record.createdById === user.userId ||
      this.hasRole(user, 'SUPER_ADMIN', 'ADMIN', 'PIMPINAN')
    )
      return;
    if (this.hasRole(user, 'PETUGAS')) {
      await this.assertPokjaAssigned(record.id, user);
      return;
    }
    throw new ForbiddenException(
      'Anda tidak memiliki akses ke Permohonan Rekomtek ini',
    );
  }

  private async transition(
    id: string,
    current: WorkflowRecord,
    target: RekomtekWorkflowStage,
    action: string,
    user: AuthenticatedUser,
    data?: Prisma.RekomtekUpdateInput,
    reason?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.$transaction((tx) =>
      this.transitionInTransaction(
        tx,
        current,
        target,
        action,
        user,
        data,
        metadata,
        reason,
      ),
    );
  }

  private async transitionInTransaction(
    tx: Prisma.TransactionClient,
    current: WorkflowRecord,
    target: RekomtekWorkflowStage,
    action: string,
    user: AuthenticatedUser,
    data?: Prisma.RekomtekUpdateInput,
    metadata?: Prisma.InputJsonValue,
    reason?: string,
  ) {
    assertWorkflowTransition(current.workflowStage!, target);
    const claimed = await tx.rekomtek.updateMany({
      where: {
        id: current.id,
        workflowStage: current.workflowStage!,
        workflowVersion: current.workflowVersion,
      },
      data: {
        ...data,
        workflowStage: target,
        status: projectWorkflowStatus(target),
        workflowVersion: { increment: 1 },
      },
    });
    if (claimed.count !== 1)
      throw new ConflictException(
        'Tahap workflow berubah bersamaan; muat ulang dan ulangi aksi',
      );
    const event = await tx.rekomtekWorkflowEvent.create({
      data: {
        rekomtekId: current.id,
        fromStage: current.workflowStage!,
        toStage: target,
        action,
        actorId: user.userId,
        actorRole: this.primaryRole(user),
        actorPermissions: user.permissions,
        reason: reason?.trim() || undefined,
        metadata,
      },
    });
    await this.createTransitionNotifications(
      tx,
      current.id,
      target,
      event.id,
      user.userId,
    );
    if (this.whatsappOutbox) {
      await this.whatsappOutbox.enqueueWorkflowTransition(tx, {
        rekomtekId: current.id,
        eventId: event.id,
        domainEventVersion: current.workflowVersion + 1,
        target,
        actorId: user.userId,
      });
      const scheduleId = this.metadataString(metadata, 'scheduleId');
      if (scheduleId && target === RekomtekWorkflowStage.EKSPOSE_TERJADWAL) {
        await this.whatsappOutbox.enqueueExposeInvitation(tx, {
          scheduleId,
          eventId: event.id,
        });
      }
      if (scheduleId && action === 'BATALKAN_EKSPOSE') {
        await this.whatsappOutbox.enqueueExposeCancelled(tx, {
          scheduleId,
          eventId: event.id,
        });
      }
    }
    return tx.rekomtek.findUnique({
      where: { id: current.id },
      include: detailInclude,
    });
  }

  private async createTransitionNotifications(
    tx: Prisma.TransactionClient,
    rekomtekId: string,
    target: RekomtekWorkflowStage,
    eventId: string,
    actorId: string,
  ): Promise<void> {
    const rekomtek = await tx.rekomtek.findUnique({
      where: { id: rekomtekId },
      select: { nomor: true, createdById: true },
    });
    if (!rekomtek) return;

    const recipients = new Set<string>();
    const applicantOrTerminal =
      isApplicantStage(target) ||
      target === RekomtekWorkflowStage.DITOLAK ||
      target === RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT;
    if (applicantOrTerminal && rekomtek.createdById)
      recipients.add(rekomtek.createdById);

    if (!applicantOrTerminal) {
      const assignment = await tx.rekomtekTeamAssignment.findFirst({
        where: { rekomtekId, isActive: true },
        include: { members: { select: { userId: true } } },
      });
      for (const member of assignment?.members ?? [])
        recipients.add(member.userId);
    }

    const permissionByStage: Partial<Record<RekomtekWorkflowStage, string>> = {
      [RekomtekWorkflowStage.MENUNGGU_PENUNJUKAN_POKJA]: 'rekomtek.assign',
      [RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN]: 'rekomtek.field',
      [RekomtekWorkflowStage.PEMERIKSAAN_PEJABAT]: 'rekomtek.inspect',
      [RekomtekWorkflowStage.MENUNGGU_PERSETUJUAN_ATASAN]:
        'rekomtek.approve.final',
      [RekomtekWorkflowStage.DISETUJUI_ATASAN]: 'rekomtek.publish.final',
    };
    const permission = permissionByStage[target];
    if (permission) {
      const officials = await tx.user.findMany({
        where: {
          isActive: true,
          OR: [
            { role: { name: 'PIMPINAN' } },
            { userRoles: { some: { role: { name: 'PIMPINAN' } } } },
          ],
          userPermissions: { some: { permission: { slug: permission } } },
        },
        select: { id: true },
      });
      for (const official of officials) recipients.add(official.id);
    }

    const data = [...recipients]
      .filter((recipientId) => recipientId !== actorId)
      .map((recipientId) => ({
        rekomtekId,
        recipientId,
        stage: target,
        title: WORKFLOW_STAGE_LABELS[target],
        message: `Permohonan ${rekomtek.nomor} memasuki tahap ${WORKFLOW_STAGE_LABELS[target]}.`,
        eventId,
      }));
    if (data.length > 0) await tx.rekomtekNotification.createMany({ data });
  }

  private metadataString(
    metadata: Prisma.InputJsonValue | undefined,
    key: string,
  ): string | undefined {
    if (
      typeof metadata !== 'object' ||
      metadata === null ||
      Array.isArray(metadata)
    ) {
      return undefined;
    }
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private async createReviewRound(
    tx: Prisma.TransactionClient,
    rekomtekId: string,
    type: RekomtekReviewType,
    decision: RekomtekReviewDecision,
    summary: string | undefined,
    findings: FindingInput[],
    user: AuthenticatedUser,
  ) {
    const last = await tx.rekomtekReviewRound.findFirst({
      where: { rekomtekId, type },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });
    const round = await tx.rekomtekReviewRound.create({
      data: {
        rekomtekId,
        type,
        roundNumber: (last?.roundNumber ?? 0) + 1,
        decision,
        summary: summary?.trim() || null,
        createdById: user.userId,
        closedById: user.userId,
        closedAt: new Date(),
        findings: findings.length
          ? {
              create: findings.map((finding) => ({
                rekomtekBerkasId: finding.berkasId,
                note: finding.note.trim(),
                createdById: user.userId,
              })),
            }
          : undefined,
      },
    });
    return round;
  }

  private async updateFindingResponsesAndRequireComplete(
    rekomtekId: string,
    responses: CorrectionResponse[],
    type: RekomtekReviewType,
    user: AuthenticatedUser,
    closeFindings = true,
  ) {
    const unique = new Map(
      responses.map((response) => [
        response.findingId,
        response.response.trim(),
      ]),
    );
    if ([...unique.values()].some((value) => !value))
      throw new BadRequestException('Jawaban perbaikan tidak boleh kosong');
    await this.prisma.$transaction(async (tx) => {
      const findings = await tx.rekomtekReviewFinding.findMany({
        where: {
          reviewRound: { rekomtekId, type },
          status: {
            in: [RekomtekFindingStatus.TERBUKA, RekomtekFindingStatus.TERJAWAB],
          },
        },
        select: { id: true, applicantResponse: true },
      });
      if (findings.length === 0)
        throw new BadRequestException(
          'Tidak ada temuan aktif untuk diperbaiki',
        );
      const findingIds = new Set(findings.map((finding) => finding.id));
      for (const findingId of unique.keys()) {
        if (!findingIds.has(findingId))
          throw new BadRequestException(
            'Temuan perbaikan tidak terkait dengan Permohonan Rekomtek ini',
          );
        await tx.rekomtekReviewFinding.update({
          where: { id: findingId },
          data: {
            applicantResponse: unique.get(findingId),
            status: RekomtekFindingStatus.TERJAWAB,
          },
        });
      }
      const incomplete = findings.filter(
        (finding) =>
          !(unique.get(finding.id) || finding.applicantResponse?.trim()),
      );
      if (incomplete.length > 0)
        throw new BadRequestException(
          'Setiap temuan aktif harus diperbarui atau diberi jawaban',
        );
      if (closeFindings) {
        await tx.rekomtekReviewFinding.updateMany({
          where: {
            id: { in: findings.map((finding) => finding.id) },
            status: RekomtekFindingStatus.TERJAWAB,
          },
          data: {
            status: RekomtekFindingStatus.DITUTUP,
            resolvedById: user.userId,
            resolvedAt: new Date(),
          },
        });
      }
    });
  }

  private async assertChecklistReady(
    id: string,
    message: string,
  ): Promise<void> {
    const validation = await this.berkasService.revalidateRequired(id);
    if (validation.issues.length > 0 || validation.incomplete.length > 0) {
      throw new BadRequestException({
        message,
        berkasIssues: validation.issues,
        incompleteBerkas: validation.incomplete,
      });
    }
  }

  private async notifyApplicantRejection(id: string): Promise<void> {
    try {
      const record = await this.prisma.rekomtek.findUnique({
        where: { id },
        select: {
          nomor: true,
          judul: true,
          createdByUser: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
      const applicant = record?.createdByUser;
      const email = applicant?.email?.trim();
      if (!record || !applicant || !email) {
        this.logger.warn(
          `Email pemohon tidak tersedia untuk notifikasi penolakan ${id}`,
        );
        return;
      }

      const applicantName = [applicant.firstName, applicant.lastName]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(' ')
        .trim();
      const appUrl = process.env.APP_URL ?? 'http://localhost:3001';
      const applicationUrl = new URL(
        `/dashboard/rekomtek/${encodeURIComponent(id)}`,
        appUrl,
      ).toString();

      await this.mailService.sendRejectionLetterEmail({
        email,
        applicantName: applicantName || 'Pemohon',
        applicationNumber: record.nomor,
        applicationTitle: record.judul,
        applicationUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Kesalahan tidak dikenal';
      this.logger.warn(
        `Notifikasi email Surat Penolakan gagal diproses untuk ${id}: ${message}`,
      );
    }
  }

  private async assertChecklistTechnicallyReady(
    id: string,
    message: string,
  ): Promise<void> {
    const validation = await this.berkasService.revalidateRequired(id);
    if (validation.issues.length > 0) {
      throw new BadRequestException({
        message,
        berkasIssues: validation.issues,
      });
    }
  }

  private async assertFindingItems(
    id: string,
    findings: FindingInput[],
  ): Promise<void> {
    const ids = [...new Set(findings.map((finding) => finding.berkasId))];
    if (ids.length !== findings.length)
      throw new BadRequestException(
        'Satu Berkas Persyaratan tidak boleh memiliki temuan ganda dalam satu aksi',
      );
    if (ids.length === 0) return;
    const count = await this.prisma.rekomtekBerkas.count({
      where: { rekomtekId: id, id: { in: ids } },
    });
    if (count !== ids.length)
      throw new BadRequestException(
        'Temuan harus menunjuk Berkas Persyaratan dari Permohonan yang sama',
      );
  }

  private async assertFinalArtifact(
    id: string,
    type: RekomtekArtifactType,
    artifactId?: string,
  ) {
    const artifact = await this.prisma.rekomtekArtifact.findFirst({
      where: {
        id: artifactId,
        rekomtekId: id,
        type,
        status: RekomtekArtifactStatus.FINAL,
        technicalStatus: BerkasTechnicalStatus.VALID,
      },
      orderBy: { version: 'desc' },
    });
    if (!artifact)
      throw new BadRequestException(
        `Artefak ${type} final dan valid wajib tersedia`,
      );
    return artifact;
  }

  private assertArtifactAllowedAtStage(
    type: RekomtekArtifactType,
    stage: RekomtekWorkflowStage,
  ): void {
    const allowed: Partial<
      Record<RekomtekWorkflowStage, RekomtekArtifactType[]>
    > = {
      [RekomtekWorkflowStage.MENUNGGU_JADWAL_EKSPOSE]: [
        RekomtekArtifactType.UNDANGAN_EKSPOSE,
      ],
      [RekomtekWorkflowStage.EKSPOSE_TERJADWAL]: [
        RekomtekArtifactType.UNDANGAN_EKSPOSE,
      ],
      [RekomtekWorkflowStage.MENUNGGU_BA_EKSPOSE]: [
        RekomtekArtifactType.BERITA_ACARA_EKSPOSE,
      ],
      [RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN]: [
        RekomtekArtifactType.SURAT_PENOLAKAN,
      ],
      [RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN]: [
        RekomtekArtifactType.SPT_LAPANGAN,
      ],
      [RekomtekWorkflowStage.MENUNGGU_BA_LAPANGAN]: [
        RekomtekArtifactType.BERITA_ACARA_LAPANGAN,
      ],
      [RekomtekWorkflowStage.MENUNGGU_BA_SIDANG_REKOMTEK]: [
        RekomtekArtifactType.BERITA_ACARA_SIDANG_REKOMTEK,
      ],
      [RekomtekWorkflowStage.PENYUSUNAN_HASIL_REKOMTEK]: [
        RekomtekArtifactType.SURAT_PERSETUJUAN,
        RekomtekArtifactType.DRAFT_REKOMTEK,
      ],
      [RekomtekWorkflowStage.DISETUJUI_ATASAN]: [
        RekomtekArtifactType.DOKUMEN_REKOMTEK,
      ],
    };
    if (!allowed[stage]?.includes(type))
      throw new BadRequestException(
        `Artefak ${type} tidak dapat diunggah pada tahap ${WORKFLOW_STAGE_LABELS[stage]}`,
      );
  }

  private async assertPokjaAssigned(
    id: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (
      this.hasRole(user, 'SUPER_ADMIN', 'ADMIN') &&
      !this.hasRole(user, 'PETUGAS')
    )
      return;
    if (!this.hasRole(user, 'PETUGAS'))
      throw new ForbiddenException(
        'Aksi ini hanya dapat dilakukan Pokja Rekomtek yang ditugaskan',
      );
    await this.assertPokjaMember(id, user.userId);
  }

  private async assertPokjaOrOfficialAccess(
    id: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (this.hasRole(user, 'PIMPINAN', 'SUPER_ADMIN', 'ADMIN')) return;
    await this.assertPokjaAssigned(id, user);
  }

  private async assertPokjaMember(id: string, userId: string): Promise<void> {
    const members = await this.prisma.rekomtekTeamMember.findMany({
      where: {
        activeUntil: null,
        assignment: { rekomtekId: id, isActive: true },
      },
      select: { id: true, userId: true },
    });
    const member = members.find((candidate) => candidate.userId === userId);
    if (!member)
      throw new ForbiddenException(
        'Petugas tidak memiliki penugasan aktif pada Permohonan Rekomtek ini',
      );
  }

  private async assertActiveUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive)
      throw new BadRequestException('Akun penanggung jawab harus aktif');
  }

  private assertApplicant(
    record: WorkflowRecord,
    user: AuthenticatedUser,
  ): void {
    if (record.createdById !== user.userId)
      throw new ForbiddenException(
        'Hanya Pemohon yang memiliki Permohonan ini yang dapat melakukan aksi tersebut',
      );
  }

  private assertStage(
    record: WorkflowRecord,
    expected: RekomtekWorkflowStage,
  ): void {
    if (record.workflowStage !== expected)
      throw new BadRequestException(
        `Aksi tidak tersedia pada tahap ${WORKFLOW_STAGE_LABELS[record.workflowStage ?? expected]}`,
      );
  }

  private assertRole(user: AuthenticatedUser, ...roles: string[]): void {
    if (!roles.some((role) => user.roles?.includes(role) || user.role === role))
      throw new ForbiddenException(
        `Aktor tidak memiliki role untuk aksi workflow ini`,
      );
  }

  private assertPermission(user: AuthenticatedUser, permission: string): void {
    if (
      user.permissions?.length &&
      !user.permissions.includes('*') &&
      !user.permissions.includes(permission)
    ) {
      throw new ForbiddenException(
        `Akses ditolak: memerlukan permission ${permission}`,
      );
    }
  }

  private hasRole(user: AuthenticatedUser, ...roles: string[]): boolean {
    return roles.some(
      (role) => user.roles?.includes(role) || user.role === role,
    );
  }

  private primaryRole(user: AuthenticatedUser): string {
    return user.role || user.roles?.[0] || 'USER';
  }

  private assertEndAfterStart(start: Date, end: Date, label: string): void {
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    )
      throw new BadRequestException(
        `${label}: waktu selesai harus setelah waktu mulai`,
      );
  }

  private parseJson(value?: string): Prisma.InputJsonValue | undefined {
    if (!value?.trim()) return undefined;
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed === null) return undefined;
      return parsed;
    } catch {
      throw new BadRequestException(
        'Metadata artefak harus berupa JSON yang valid',
      );
    }
  }
}
