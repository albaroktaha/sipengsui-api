import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  Prisma,
  RekomtekExposeStatus,
  RekomtekWorkflowStage,
  WhatsAppConsentPurpose,
  WhatsAppIdentityStatus,
  WhatsAppOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppConfig } from './whatsapp.config';
import { WhatsAppMessageRegistry } from './whatsapp-message.registry';
import type {
  WhatsAppExposeMessageContext,
  WhatsAppMessageKey,
  WhatsAppStageMessageContext,
} from './whatsapp.types';
import { normalizeWhatsAppPhone } from './whatsapp-security';
import { WhatsAppMetricsService } from './whatsapp-metrics.service';
import { isApplicantStage } from '../rekomtek/workflow-state';

const STAGE_LABELS: Record<string, string> = {
  PEMOHON_DRAFT: 'Draft Pemohon',
  MENUNGGU_PENUNJUKAN_POKJA: 'Menunggu Penunjukan Pokja',
  EVALUASI_DOKUMEN_AWAL: 'Evaluasi Dokumen Awal',
  PERBAIKAN_AWAL_PEMOHON: 'Perbaikan Dokumen Awal',
  EVALUASI_DOKUMEN_ULANG: 'Evaluasi Dokumen Ulang',
  PENYUSUNAN_SURAT_PENOLAKAN: 'Penyusunan Surat Penolakan',
  DITOLAK: 'Ditolak',
  MENUNGGU_JADWAL_EKSPOSE: 'Menunggu Jadwal Ekspose',
  EKSPOSE_TERJADWAL: 'Ekspose Terjadwal',
  MENUNGGU_BA_EKSPOSE: 'Menunggu Berita Acara Ekspose',
  VERIFIKASI_HASIL_EKSPOSE: 'Verifikasi Hasil Ekspose',
  PERBAIKAN_PASCA_EKSPOSE: 'Perbaikan Pasca-Ekspose',
  VERIFIKASI_PERBAIKAN_PASCA_EKSPOSE: 'Verifikasi Perbaikan Pasca-Ekspose',
  MENUNGGU_SPT_LAPANGAN: 'Menunggu SPT Lapangan',
  KUNJUNGAN_LAPANGAN_DITUGASKAN: 'Kunjungan Lapangan Ditugaskan',
  MENUNGGU_BA_LAPANGAN: 'Menunggu Berita Acara Lapangan',
  PERSIAPAN_SIDANG_REKOMTEK: 'Persiapan Sidang Rekomtek',
  MENUNGGU_BA_SIDANG_REKOMTEK: 'Menunggu Berita Acara Sidang Rekomtek',
  PENYUSUNAN_HASIL_REKOMTEK: 'Penyusunan Hasil Rekomtek',
  PEMERIKSAAN_PEJABAT: 'Pemeriksaan Pejabat Rekomtek',
  MENUNGGU_PERSETUJUAN_ATASAN: 'Menunggu Persetujuan Atasan Pejabat',
  DISETUJUI_ATASAN: 'Disetujui Atasan Pejabat',
  DOKUMEN_REKOMTEK_TERBIT: 'Dokumen Rekomtek Terbit',
};

const NEXT_ACTIONS: Record<string, string> = {
  MENUNGGU_PENUNJUKAN_POKJA: 'Pejabat menunjuk Pokja Rekomtek',
  EVALUASI_DOKUMEN_AWAL: 'Pokja mengevaluasi Berkas Persyaratan',
  PERBAIKAN_AWAL_PEMOHON: 'Pemohon melengkapi temuan perbaikan',
  EVALUASI_DOKUMEN_ULANG: 'Pokja memeriksa perbaikan Pemohon',
  PENYUSUNAN_SURAT_PENOLAKAN: 'Petugas menyusun Surat Penolakan',
  DITOLAK: 'Lihat hasil dan Surat Penolakan di web',
  MENUNGGU_JADWAL_EKSPOSE: 'Pejabat membuat jadwal Ekspose',
  EKSPOSE_TERJADWAL: 'Buka undangan Ekspose di web',
  DOKUMEN_REKOMTEK_TERBIT: 'Lihat Dokumen Rekomtek di web',
};

const INTERNAL_PERMISSION_BY_STAGE: Partial<
  Record<RekomtekWorkflowStage, string>
> = {
  [RekomtekWorkflowStage.MENUNGGU_PENUNJUKAN_POKJA]: 'rekomtek.assign',
  [RekomtekWorkflowStage.MENUNGGU_SPT_LAPANGAN]: 'rekomtek.field',
  [RekomtekWorkflowStage.PEMERIKSAAN_PEJABAT]: 'rekomtek.inspect',
  [RekomtekWorkflowStage.MENUNGGU_PERSETUJUAN_ATASAN]: 'rekomtek.approve.final',
  [RekomtekWorkflowStage.DISETUJUI_ATASAN]: 'rekomtek.publish.final',
};

type DbClient = PrismaService | Prisma.TransactionClient;

type StageTransitionInput = {
  rekomtekId: string;
  eventId: string;
  domainEventVersion?: number;
  target: RekomtekWorkflowStage;
  actorId?: string;
};

@Injectable()
export class WhatsAppOutboxService {
  private readonly registry: WhatsAppMessageRegistry;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfig,
    registry: WhatsAppMessageRegistry,
    @Optional() private readonly metrics?: WhatsAppMetricsService,
  ) {
    this.registry = registry;
  }

  async enqueueWorkflowTransition(
    db: DbClient,
    input: StageTransitionInput,
  ): Promise<number> {
    if (!this.config.enabled) return 0;
    const messageKey = this.stageMessageKey(input.target);
    if (!messageKey) return 0;

    const rekomtek = await db.rekomtek.findUnique({
      where: { id: input.rekomtekId },
      select: { nomor: true, createdById: true },
    });
    if (!rekomtek) return 0;

    const recipientIds = new Set<string>();
    const applicantMessage =
      isApplicantStage(input.target) ||
      input.target === RekomtekWorkflowStage.DITOLAK ||
      input.target === RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT;
    if (applicantMessage && rekomtek.createdById) {
      recipientIds.add(rekomtek.createdById);
    }
    if (!applicantMessage) {
      const assignment = await db.rekomtekTeamAssignment.findFirst({
        where: { rekomtekId: input.rekomtekId, isActive: true },
        include: { members: { select: { userId: true } } },
      });
      for (const member of assignment?.members ?? []) {
        recipientIds.add(member.userId);
      }
      const permission = INTERNAL_PERMISSION_BY_STAGE[input.target];
      if (permission) {
        const officials = await db.user.findMany({
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
        for (const official of officials) recipientIds.add(official.id);
      }
    }
    if (input.actorId) recipientIds.delete(input.actorId);

    const identities = await this.findEligibleIdentities(
      db,
      [...recipientIds],
      WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
    );
    const eligibleRecipientIds = new Set(
      identities
        .map((identity) => identity.userId)
        .filter((userId): userId is string => Boolean(userId)),
    );
    const skippedRecipientIds = [...recipientIds].filter(
      (recipientId) => !eligibleRecipientIds.has(recipientId),
    );
    if (skippedRecipientIds.length > 0) {
      await this.recordSkippedRecipients(db, skippedRecipientIds, {
        purpose: WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
        messageKey,
        messageVersion: this.config.messageVersion(messageKey),
        domainEventId: input.eventId,
        reason: 'IDENTITY_OR_CONSENT_NOT_ELIGIBLE',
      });
    }
    if (identities.length === 0) {
      return 0;
    }

    const context: WhatsAppStageMessageContext = {
      applicationNumber: rekomtek.nomor,
      stageLabel: this.stageLabel(input.target),
      nextAction: NEXT_ACTIONS[input.target] ?? 'Buka detail di web SIPENGSUI',
      applicationUrl: `${this.config.appUrl}/dashboard/rekomtek/${input.rekomtekId}`,
    };
    const message = this.registry.resolve(messageKey, context);
    if (!message) return 0;

    const data = identities.map((identity) => ({
      recipientIdentityId: identity.id,
      provider: 'waha',
      purpose: WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
      messageKey: message.messageKey,
      messageVersion: message.messageVersion,
      language: message.language,
      textBody: message.text,
      textSnapshotHash: this.hashText(message.text),
      dedupeKey: `${input.eventId}:v${input.domainEventVersion ?? 1}:${identity.id}:WHATSAPP:${message.messageKey}:${message.messageVersion}`,
      domainEventId: input.eventId,
      domainEventVersion: input.domainEventVersion,
      workflowEventId: input.eventId,
      status: WhatsAppOutboxStatus.PENDING,
      maxAttempts: this.config.maxAttempts,
    }));
    const result = await db.whatsAppOutbox.createMany({
      data,
      skipDuplicates: true,
    });
    return result.count;
  }

  async enqueueExposeInvitation(
    db: DbClient,
    input: { scheduleId: string; eventId: string },
  ): Promise<number> {
    const schedule = await this.findExposeSchedule(db, input.scheduleId);
    if (!schedule || schedule.status !== RekomtekExposeStatus.TERJADWAL)
      return 0;
    return this.enqueueExposeMessage(db, schedule, {
      messageKey: 'EXPOSE_INVITATION',
      domainEventId: input.eventId,
      workflowEventId: input.eventId,
      dedupeSuffix: 'EXPOSE_INVITATION',
    });
  }

  async enqueueExposeReminders(): Promise<number> {
    if (!this.config.enabled || !this.config.exposeRemindersEnabled) {
      return 0;
    }
    const now = new Date();
    const maxOffset = Math.max(...this.config.exposeReminderOffsetsMinutes);
    const schedules = await this.prisma.rekomtekExposeSchedule.findMany({
      where: {
        status: RekomtekExposeStatus.TERJADWAL,
        startsAt: {
          gt: now,
          lte: new Date(now.getTime() + maxOffset * 60_000),
        },
      },
      select: {
        id: true,
        rekomtekId: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        method: true,
        venue: true,
        agenda: true,
        invitationNumber: true,
        participants: true,
        responsibleUserId: true,
        scheduleVersion: true,
        status: true,
        rekomtek: { select: { nomor: true } },
      },
      take: 100,
    });

    let created = 0;
    for (const schedule of schedules) {
      const remainingMs = schedule.startsAt.getTime() - now.getTime();
      for (const offset of this.config.exposeReminderOffsetsMinutes) {
        if (remainingMs > offset * 60_000) continue;
        created += await this.enqueueExposeMessage(this.prisma, schedule, {
          messageKey: 'EXPOSE_REMINDER',
          domainEventId: `schedule:${schedule.id}:reminder:${offset}`,
          domainEventVersion: offset,
          dedupeSuffix: `EXPOSE_REMINDER:${offset}`,
        });
      }
    }
    return created;
  }

  async enqueueTextReply(
    identityId: string,
    text: string,
    dedupeKey: string,
    options: { consentRequired?: boolean } = {},
  ): Promise<void> {
    if (!this.config.enabled || !text.trim()) return;
    const identity = await this.prisma.whatsAppIdentity.findFirst({
      where: { id: identityId, status: WhatsAppIdentityStatus.ACTIVE },
      select: { id: true },
    });
    if (!identity) return;
    const textBody = text.trim().slice(0, 4_000);
    await this.prisma.whatsAppOutbox.createMany({
      data: {
        recipientIdentityId: identity.id,
        provider: 'waha',
        purpose: WhatsAppConsentPurpose.SERVICE_CONVERSATION,
        consentRequired: options.consentRequired ?? true,
        messageKey: 'CONVERSATION_REPLY',
        messageVersion: this.config.messageVersion('CONVERSATION_REPLY'),
        language: this.config.defaultLanguage,
        textBody,
        textSnapshotHash: this.hashText(textBody),
        dedupeKey,
        status: WhatsAppOutboxStatus.PENDING,
        maxAttempts: this.config.maxAttempts,
      },
      skipDuplicates: true,
    });
  }

  async getAdminSummary() {
    const [
      outboxStatuses,
      inboundStatuses,
      deliveryStatuses,
      identityStatuses,
      skippedStatuses,
    ] = await Promise.all([
      this.prisma.whatsAppOutbox.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.whatsAppInboundEvent.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.whatsAppDeliveryEvent.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.whatsAppIdentity.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.whatsAppOutboxSkipEvent.groupBy({
        by: ['reason'],
        _count: { _all: true },
      }),
    ]);
    const summarize = <T extends { status: string; _count: { _all: number } }>(
      items: T[],
    ) =>
      items.map((item) => ({ status: item.status, count: item._count._all }));
    return {
      enabled: this.config.enabled,
      identities: summarize(identityStatuses),
      inbound: summarize(inboundStatuses),
      outbox: summarize(outboxStatuses),
      delivery: summarize(deliveryStatuses),
      skipped: skippedStatuses.map((item) => ({
        reason: item.reason,
        count: item._count._all,
      })),
      metrics: this.metrics?.snapshot() ?? null,
    };
  }

  async requeueDead(id: string, actorUserId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.whatsAppOutbox.updateMany({
        where: { id, provider: 'waha', status: WhatsAppOutboxStatus.DEAD },
        data: {
          status: WhatsAppOutboxStatus.PENDING,
          attemptCount: 0,
          nextAttemptAt: new Date(),
          leaseUntil: null,
          lockedBy: null,
          sendStartedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          failedAt: null,
        },
      });
      if (result.count !== 1) return false;
      await tx.whatsAppAdminAuditEvent.create({
        data: {
          action: 'REQUEUE_WHATSAPP_OUTBOX',
          actorUserId,
          outboxId: id,
          metadata: { reason: 'ADMIN_REQUEUE' },
        },
      });
      return true;
    });
  }

  private async recordSkippedRecipients(
    db: DbClient,
    userIds: string[],
    input: {
      purpose: WhatsAppConsentPurpose;
      messageKey: WhatsAppMessageKey;
      messageVersion: string;
      domainEventId: string;
      reason: string;
    },
  ): Promise<void> {
    if (userIds.length === 0) return;
    await db.whatsAppOutboxSkipEvent.createMany({
      data: userIds.map((recipientUserId) => ({
        recipientUserId,
        recipientIdentityId: null,
        purpose: input.purpose,
        messageKey: input.messageKey,
        messageVersion: input.messageVersion,
        domainEventId: input.domainEventId,
        reason: input.reason,
        dedupeKey: `${input.domainEventId}:skip:${recipientUserId}:${input.reason}`,
      })),
      skipDuplicates: true,
    });
  }

  async findEligibleIdentities(
    db: DbClient,
    userIds: string[],
    purpose: WhatsAppConsentPurpose,
  ) {
    if (userIds.length === 0) return [];
    return db.whatsAppIdentity.findMany({
      where: {
        userId: { in: userIds },
        status: WhatsAppIdentityStatus.ACTIVE,
        verifiedAt: { not: null },
        user: { isActive: true },
        consents: { some: { purpose, active: true } },
      },
      select: { id: true, phoneE164: true, userId: true },
    });
  }

  async findEligibleIdentitiesByPhone(
    db: DbClient,
    phoneE164s: string[],
    purpose: WhatsAppConsentPurpose,
  ) {
    if (phoneE164s.length === 0) return [];
    return db.whatsAppIdentity.findMany({
      where: {
        phoneE164: { in: phoneE164s },
        status: WhatsAppIdentityStatus.ACTIVE,
        verifiedAt: { not: null },
        OR: [{ user: { isActive: true } }, { userId: null }],
        consents: { some: { purpose, active: true } },
      },
      select: { id: true, phoneE164: true, userId: true },
    });
  }

  private async findExposeSchedule(db: DbClient, scheduleId: string) {
    return db.rekomtekExposeSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        rekomtekId: true,
        startsAt: true,
        endsAt: true,
        timeZone: true,
        method: true,
        venue: true,
        agenda: true,
        invitationNumber: true,
        participants: true,
        responsibleUserId: true,
        scheduleVersion: true,
        status: true,
        rekomtek: { select: { nomor: true } },
      },
    });
  }

  private async enqueueExposeMessage(
    db: DbClient,
    schedule: Awaited<ReturnType<WhatsAppOutboxService['findExposeSchedule']>>,
    input: {
      messageKey: Extract<WhatsAppMessageKey, `EXPOSE_${string}`>;
      domainEventId: string;
      domainEventVersion?: number;
      workflowEventId?: string;
      dedupeSuffix: string;
    },
  ): Promise<number> {
    if (
      !this.config.enabled ||
      !schedule ||
      schedule.status !== RekomtekExposeStatus.TERJADWAL
    ) {
      return 0;
    }
    const participantIds = new Set<string>([schedule.responsibleUserId]);
    const externalPhoneNumbers = new Set<string>();
    if (Array.isArray(schedule.participants)) {
      for (const participant of schedule.participants) {
        if (typeof participant === 'string') participantIds.add(participant);
        if (
          typeof participant === 'object' &&
          participant !== null &&
          !Array.isArray(participant)
        ) {
          const externalParticipant = participant as {
            type?: unknown;
            whatsappNumber?: unknown;
          };
          if (
            externalParticipant.type === 'EXTERNAL' &&
            typeof externalParticipant.whatsappNumber === 'string'
          ) {
            try {
              externalPhoneNumbers.add(
                normalizeWhatsAppPhone(
                  externalParticipant.whatsappNumber,
                  this.config.defaultCountryCode,
                ),
              );
            } catch {
              // Nomor legacy tidak valid tidak boleh memblokir jadwal.
            }
          }
        }
      }
    }
    const internalIdentities = await this.findEligibleIdentities(
      db,
      [...participantIds],
      WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
    );
    const externalIdentities = await this.findEligibleIdentitiesByPhone(
      db,
      [...externalPhoneNumbers],
      WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
    );
    const identities = [
      ...new Map(
        [...internalIdentities, ...externalIdentities].map((identity) => [
          identity.id,
          identity,
        ]),
      ).values(),
    ];
    if (identities.length === 0) return 0;

    const context: WhatsAppExposeMessageContext = {
      invitationNumber: schedule.invitationNumber ?? 'Undangan Ekspose',
      applicationNumber: schedule.rekomtek.nomor,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      timeZone: schedule.timeZone,
      method: schedule.method,
      venue: schedule.venue,
      agenda: schedule.agenda,
      applicationUrl: `${this.config.appUrl}/dashboard/rekomtek/${schedule.rekomtekId}?schedule=${schedule.id}`,
    };
    const message = this.registry.resolve(input.messageKey, context);
    if (!message) return 0;

    const data = identities.map((identity) => ({
      recipientIdentityId: identity.id,
      provider: 'waha',
      purpose: WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
      messageKey: message.messageKey,
      messageVersion: message.messageVersion,
      language: message.language,
      textBody: message.text,
      textSnapshotHash: this.hashText(message.text),
      dedupeKey: `${schedule.id}:${schedule.scheduleVersion}:${identity.id}:${input.dedupeSuffix}:${message.messageVersion}`,
      domainEventId: input.domainEventId,
      domainEventVersion: input.domainEventVersion,
      workflowEventId: input.workflowEventId,
      scheduleId: schedule.id,
      scheduleVersion: schedule.scheduleVersion,
      status: WhatsAppOutboxStatus.PENDING,
      maxAttempts: this.config.maxAttempts,
    }));
    const result = await db.whatsAppOutbox.createMany({
      data,
      skipDuplicates: true,
    });
    return result.count;
  }

  private stageMessageKey(
    target: RekomtekWorkflowStage,
  ): WhatsAppMessageKey | null {
    if (
      target === RekomtekWorkflowStage.EKSPOSE_TERJADWAL ||
      target === RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN
    ) {
      return null;
    }
    if (target === RekomtekWorkflowStage.PERBAIKAN_AWAL_PEMOHON) {
      return 'CORRECTION_REQUIRED';
    }
    if (target === RekomtekWorkflowStage.DITOLAK) return 'REJECTED';
    if (target === RekomtekWorkflowStage.DOKUMEN_REKOMTEK_TERBIT) {
      return 'PUBLISHED';
    }
    return 'STAGE_CHANGED';
  }

  private stageLabel(stage: RekomtekWorkflowStage): string {
    return STAGE_LABELS[stage] ?? stage;
  }

  private hashText(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }
}
