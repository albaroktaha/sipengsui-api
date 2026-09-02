import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  RekomtekWorkflowStage,
  WhatsAppConversationState,
  WhatsAppConsentPurpose,
  WhatsAppConsentSource,
  WhatsAppInboundStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../modules/ai/ai.service';
import { WORKFLOW_STAGE_LABELS } from '../rekomtek/workflow-state';
import { WhatsAppConfig } from './whatsapp.config';
import { WhatsAppIdentityService } from './whatsapp-identity.service';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';
import { WhatsAppMetricsService } from './whatsapp-metrics.service';

const MENU_MESSAGE =
  'Halo, ini Asisten WhatsApp SIPENGSUI.\n\n' +
  'Ketik:\n' +
  '• MENU — melihat menu\n' +
  '• BANTUAN — cara memakai bot\n' +
  '• STATUS — melihat Permohonan Rekomtek milik akun tertaut\n' +
  '• MULAI NOTIFIKASI — mengaktifkan notifikasi setelah konfirmasi\n' +
  '• BERHENTI — menghentikan pesan keluar';

const HELP_MESSAGE =
  'Bot WhatsApp hanya memberikan informasi dan notifikasi. Pengajuan, upload berkas, evaluasi, persetujuan, dan tindakan resmi tetap dilakukan melalui web SIPENGSUI. Jangan kirim password, token, atau dokumen rahasia melalui WhatsApp.';

const PAIRING_MESSAGE =
  'Nomor ini belum tertaut. Buka Profil SIPENGSUI, pilih “Hubungkan WhatsApp”, lalu kirim kode pairing yang ditampilkan di sini. Kode hanya sekali pakai dan cepat kedaluwarsa.';

const TRANSACTIONAL_CONSENT_MESSAGE =
  'Notifikasi Permohonan Rekomtek akan memuat nomor permohonan, tahap, tindakan berikutnya, dan tautan web. Balas SETUJU NOTIFIKASI untuk mengaktifkan atau BERHENTI untuk membatalkan.';

const SERVICE_CONSENT_MESSAGE =
  'Percakapan informasi publik memerlukan persetujuan layanan. Balas SETUJU LAYANAN untuk melanjutkan atau BANTUAN untuk melihat batas layanan.';

const GENERIC_STATUS_MESSAGE =
  'Permohonan tidak ditemukan atau tidak tersedia untuk nomor WhatsApp ini.';

interface WhatsAppRouteResponse {
  text: string;
  consentRequired: boolean;
}

function routeResponse(
  text: string,
  consentRequired = true,
): WhatsAppRouteResponse {
  return { text, consentRequired };
}

@Injectable()
export class WhatsAppRouterService {
  private readonly logger = new Logger(WhatsAppRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfig,
    private readonly identityService: WhatsAppIdentityService,
    private readonly outbox: WhatsAppOutboxService,
    private readonly ai: AiService,
    @Optional() private readonly metrics?: WhatsAppMetricsService,
  ) {}

  async processInbound(inboundId: string): Promise<void> {
    const startedAt = Date.now();
    const now = new Date();
    const inboxMaxAttempts = this.config.inboxMaxAttempts ?? 6;
    const claimed = await this.prisma.whatsAppInboundEvent.updateMany({
      where: {
        id: inboundId,
        nextAttemptAt: { lte: now },
        OR: [
          { status: WhatsAppInboundStatus.RECEIVED },
          {
            status: WhatsAppInboundStatus.FAILED,
            attemptCount: { lt: inboxMaxAttempts },
          },
        ],
      },
      data: {
        status: WhatsAppInboundStatus.PROCESSING,
        attemptCount: { increment: 1 },
        errorCode: null,
      },
    });
    if (claimed.count !== 1) return;

    const event = await this.prisma.whatsAppInboundEvent.findUnique({
      where: { id: inboundId },
      include: { identity: true },
    });
    if (!event) return;

    try {
      const conversation = await this.touchConversation(event.identityId);
      const response = await this.routeText({
        inboundId: event.id,
        identity: event.identity,
        conversation,
        messageType: event.messageType,
        text: event.textBody ?? '',
      });
      if (response) {
        await this.outbox.enqueueTextReply(
          event.identityId,
          response.text,
          `inbound:${event.providerEventId}:reply`,
          { consentRequired: response.consentRequired },
        );
      }
      await this.prisma.whatsAppInboundEvent.update({
        where: { id: event.id },
        data: {
          status: WhatsAppInboundStatus.PROCESSED,
          processedAt: new Date(),
          nextAttemptAt: null,
          errorCode: null,
        },
      });
      this.metrics?.increment('inbound_processed');
      this.metrics?.observeInboundProcessing(Date.now() - startedAt);
    } catch (error) {
      this.logger.warn(
        `Pemrosesan inbound WhatsApp gagal: ${this.safeErrorCode(error)}`,
      );
      const attemptCount = event.attemptCount ?? 1;
      const retryable = attemptCount < inboxMaxAttempts;
      const inboxRetryBaseMs = this.config.inboxRetryBaseMs ?? 15_000;
      const retryDelayMs = Math.min(
        3_600_000,
        inboxRetryBaseMs * 2 ** Math.min(attemptCount - 1, 10),
      );
      await this.prisma.whatsAppInboundEvent.update({
        where: { id: event.id },
        data: {
          status: WhatsAppInboundStatus.FAILED,
          processedAt: null,
          errorCode: this.safeErrorCode(error),
          nextAttemptAt: retryable ? new Date(Date.now() + retryDelayMs) : null,
        },
      });
      this.metrics?.increment('inbound_failed');
      this.metrics?.observeInboundProcessing(Date.now() - startedAt);
    }
  }

  private async routeText(input: {
    inboundId: string;
    identity: {
      id: string;
      phoneE164: string;
      providerWaId: string | null;
      userId: string | null;
      verifiedAt: Date | null;
      status: string;
    };
    conversation: {
      state: WhatsAppConversationState;
    };
    messageType: string;
    text: string;
  }): Promise<WhatsAppRouteResponse | null> {
    if (input.messageType !== 'TEXT') {
      return this.serviceReply(
        input.identity,
        'Jenis pesan ini belum didukung. Kirim teks atau ketik BANTUAN.',
      );
    }

    const text = input.text.trim();
    const command = text.toLocaleUpperCase('id-ID').replace(/\s+/g, ' ');
    if (!text) return this.serviceReply(input.identity, MENU_MESSAGE);

    const pairingCode = this.extractPairingCode(
      text,
      input.conversation.state,
      !this.isLinked(input.identity),
    );
    if (pairingCode) {
      try {
        await this.identityService.linkPairingCode(
          input.identity.phoneE164,
          input.identity.providerWaId ?? undefined,
          pairingCode,
        );
        await this.setConversationState(
          input.identity.id,
          WhatsAppConversationState.MENU,
        );
        return routeResponse(
          'WhatsApp berhasil ditautkan dan diverifikasi ke akun SIPENGSUI. Untuk menerima notifikasi Permohonan Rekomtek, ketik MULAI NOTIFIKASI.',
          false,
        );
      } catch {
        this.metrics?.increment('pairing_failure');
        return routeResponse(
          'Kode pairing tidak valid, sudah digunakan, atau sudah kedaluwarsa.',
          false,
        );
      }
    }

    if (command === 'BERHENTI') {
      await this.identityService.optOutIdentity(input.identity.id);
      await this.setConversationState(
        input.identity.id,
        WhatsAppConversationState.MENU,
      );
      return routeResponse(
        'Persetujuan pesan keluar telah dihentikan. Ketik MULAI NOTIFIKASI jika ingin memulai persetujuan baru.',
        false,
      );
    }

    if (
      input.conversation.state ===
      WhatsAppConversationState.AWAITING_TRANSACTIONAL_CONSENT
    ) {
      if (
        command === 'SETUJU NOTIFIKASI' ||
        command === 'YA' ||
        command === 'SETUJU'
      ) {
        if (!this.isNotificationEligible(input.identity)) {
          return routeResponse(PAIRING_MESSAGE, false);
        }
        await this.identityService.setConsentForIdentity(
          input.identity.id,
          WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
          true,
          WhatsAppConsentSource.WHATSAPP,
          input.identity.userId ?? undefined,
        );
        await this.setConversationState(
          input.identity.id,
          WhatsAppConversationState.MENU,
        );
        return routeResponse(
          'Notifikasi Permohonan Rekomtek telah diaktifkan. Ketik BERHENTI kapan saja untuk menghentikannya.',
          false,
        );
      }
      return routeResponse(TRANSACTIONAL_CONSENT_MESSAGE, false);
    }

    if (command === 'SETUJU LAYANAN') {
      await this.identityService.setConsentForIdentity(
        input.identity.id,
        WhatsAppConsentPurpose.SERVICE_CONVERSATION,
        true,
        WhatsAppConsentSource.WHATSAPP,
        input.identity.userId ?? undefined,
      );
      await this.setConversationState(
        input.identity.id,
        WhatsAppConversationState.MENU,
      );
      return routeResponse(
        'Persetujuan percakapan layanan dicatat. ' + MENU_MESSAGE,
        false,
      );
    }

    if (command === 'MULAI NOTIFIKASI') {
      if (!this.isNotificationEligible(input.identity)) {
        await this.setConversationState(
          input.identity.id,
          WhatsAppConversationState.AWAITING_PAIRING,
        );
        return routeResponse(PAIRING_MESSAGE, false);
      }
      await this.setConversationState(
        input.identity.id,
        WhatsAppConversationState.AWAITING_TRANSACTIONAL_CONSENT,
      );
      return routeResponse(TRANSACTIONAL_CONSENT_MESSAGE, false);
    }

    if (command === 'MENU' || command === 'MULAI' || this.isGreeting(command)) {
      return this.serviceReply(input.identity, MENU_MESSAGE);
    }
    if (command === 'BANTUAN') {
      return this.serviceReply(input.identity, HELP_MESSAGE);
    }

    const statusMatch = /^STATUS(?:\s+(.+))?$/i.exec(text);
    if (statusMatch) {
      if (!(await this.consumeStatusRateLimit(input.identity.id))) {
        return routeResponse(
          'Permintaan STATUS dari nomor ini terlalu sering. Silakan coba lagi nanti.',
          false,
        );
      }
      if (this.isLinked(input.identity)) {
        const serviceConsent = await this.identityService.hasActiveConsent(
          input.identity.id,
          WhatsAppConsentPurpose.SERVICE_CONVERSATION,
        );
        if (!serviceConsent)
          return routeResponse(SERVICE_CONSENT_MESSAGE, false);
      }
      return this.statusResponse(
        input.identity,
        statusMatch[1]?.trim() || null,
      );
    }

    const serviceConsent = await this.identityService.hasActiveConsent(
      input.identity.id,
      WhatsAppConsentPurpose.SERVICE_CONVERSATION,
    );
    if (!serviceConsent) return routeResponse(SERVICE_CONSENT_MESSAGE, false);
    if (!(await this.consumeAiRateLimit(input.identity.id))) {
      return routeResponse(
        'Permintaan AI dari nomor ini terlalu sering. Silakan coba lagi nanti.',
      );
    }

    return this.ai
      .createTextAnswer({
        question: text,
        userId: this.isLinked(input.identity)
          ? (input.identity.userId ?? undefined)
          : undefined,
        roles: [],
        channel: 'WHATSAPP',
      })
      .then((answer) => routeResponse(answer));
  }

  private async serviceReply(
    identity: {
      id: string;
      userId: string | null;
      verifiedAt: Date | null;
      status: string;
    },
    text: string,
  ): Promise<WhatsAppRouteResponse> {
    if (!this.isLinked(identity)) return routeResponse(text, false);
    const serviceConsent = await this.identityService.hasActiveConsent(
      identity.id,
      WhatsAppConsentPurpose.SERVICE_CONVERSATION,
    );
    return serviceConsent
      ? routeResponse(text)
      : routeResponse(SERVICE_CONSENT_MESSAGE, false);
  }

  private async statusResponse(
    identity: {
      userId: string | null;
      verifiedAt: Date | null;
      status: string;
    },
    exactNumber: string | null,
  ): Promise<WhatsAppRouteResponse> {
    if (
      !identity.userId ||
      !identity.verifiedAt ||
      identity.status !== 'ACTIVE'
    ) {
      return routeResponse(PAIRING_MESSAGE, false);
    }

    if (exactNumber) {
      const record = await this.prisma.rekomtek.findUnique({
        where: { nomor: exactNumber },
        select: {
          id: true,
          createdById: true,
          nomor: true,
          judul: true,
          workflowStage: true,
          status: true,
          updatedAt: true,
        },
      });
      if (!record || record.createdById !== identity.userId)
        return routeResponse(GENERIC_STATUS_MESSAGE);
      return routeResponse(this.formatStatus(record));
    }

    const records = await this.prisma.rekomtek.findMany({
      where: { createdById: identity.userId },
      select: {
        id: true,
        nomor: true,
        judul: true,
        workflowStage: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    if (records.length === 0)
      return routeResponse('Belum ada Permohonan Rekomtek pada akun tertaut.');
    return routeResponse(
      [
        'Permohonan Rekomtek Anda:',
        ...records.map((record) => this.formatStatus(record)),
        '',
        'Ketik STATUS <nomor> untuk melihat satu permohonan.',
      ].join('\n'),
    );
  }

  private formatStatus(record: {
    id: string;
    nomor: string;
    judul: string;
    workflowStage: RekomtekWorkflowStage | null;
    status: string;
    updatedAt: Date;
  }): string {
    const stage = record.workflowStage
      ? WORKFLOW_STAGE_LABELS[record.workflowStage]
      : record.status;
    const title = record.judul.trim().slice(0, 120);
    const updated = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(record.updatedAt);
    return `${record.nomor} - ${title}\nTahap: ${stage}\nDiperbarui: ${updated} WIB\n${this.config.appUrl}/dashboard/rekomtek/${record.id}`;
  }

  private async touchConversation(identityId: string) {
    const now = new Date();
    const serviceWindowExpiresAt = new Date(
      now.getTime() + this.config.serviceWindowHours * 60 * 60_000,
    );
    const current = await this.prisma.whatsAppConversation.findUnique({
      where: { identityId },
      select: { state: true, stateExpiresAt: true },
    });
    const state =
      current?.stateExpiresAt && current.stateExpiresAt > now
        ? current.state
        : WhatsAppConversationState.MENU;
    return this.prisma.whatsAppConversation.upsert({
      where: { identityId },
      create: {
        identityId,
        state,
        serviceWindowExpiresAt,
        lastInboundAt: now,
        lastMessageAt: now,
      },
      update: {
        state,
        serviceWindowExpiresAt,
        lastInboundAt: now,
        lastMessageAt: now,
      },
      select: { state: true },
    });
  }

  private async setConversationState(
    identityId: string,
    state: WhatsAppConversationState,
  ): Promise<void> {
    const stateExpiresAt =
      state === WhatsAppConversationState.MENU
        ? null
        : new Date(
            Date.now() + this.config.conversationStateTtlMinutes * 60_000,
          );
    await this.prisma.whatsAppConversation.updateMany({
      where: { identityId },
      data: { state, stateExpiresAt },
    });
  }

  private async consumeAiRateLimit(identityId: string): Promise<boolean> {
    const now = new Date();
    const current = await this.prisma.whatsAppConversation.findUnique({
      where: { identityId },
      select: {
        aiRequestCount: true,
        aiRequestWindowStartedAt: true,
      },
    });
    const windowStart = current?.aiRequestWindowStartedAt ?? null;
    const withinWindow = Boolean(
      windowStart &&
      now.getTime() - windowStart.getTime() <
        this.config.aiRateWindowMinutes * 60_000,
    );
    const windowCutoff = new Date(
      now.getTime() - this.config.aiRateWindowMinutes * 60_000,
    );
    if (
      withinWindow &&
      (current?.aiRequestCount ?? 0) >= this.config.aiRateLimit
    ) {
      return false;
    }
    const updated = withinWindow
      ? await this.prisma.whatsAppConversation.updateMany({
          where: {
            identityId,
            aiRequestWindowStartedAt: windowStart,
            aiRequestCount: { lt: this.config.aiRateLimit },
          },
          data: { aiRequestCount: { increment: 1 } },
        })
      : await this.prisma.whatsAppConversation.updateMany({
          where: {
            identityId,
            OR: [
              { aiRequestWindowStartedAt: null },
              { aiRequestWindowStartedAt: { lt: windowCutoff } },
            ],
          },
          data: {
            aiRequestCount: 1,
            aiRequestWindowStartedAt: now,
          },
        });
    return updated.count === 1;
  }

  private async consumeStatusRateLimit(identityId: string): Promise<boolean> {
    const now = new Date();
    const current = await this.prisma.whatsAppConversation.findUnique({
      where: { identityId },
      select: {
        statusRequestCount: true,
        statusRequestWindowStartedAt: true,
      },
    });
    const windowStart = current?.statusRequestWindowStartedAt ?? null;
    const withinWindow = Boolean(
      windowStart &&
      now.getTime() - windowStart.getTime() <
        this.config.statusRateWindowMinutes * 60_000,
    );
    const windowCutoff = new Date(
      now.getTime() - this.config.statusRateWindowMinutes * 60_000,
    );
    if (
      withinWindow &&
      (current?.statusRequestCount ?? 0) >= this.config.statusRateLimit
    ) {
      return false;
    }
    const updated = withinWindow
      ? await this.prisma.whatsAppConversation.updateMany({
          where: {
            identityId,
            statusRequestWindowStartedAt: windowStart,
            statusRequestCount: { lt: this.config.statusRateLimit },
          },
          data: { statusRequestCount: { increment: 1 } },
        })
      : await this.prisma.whatsAppConversation.updateMany({
          where: {
            identityId,
            OR: [
              { statusRequestWindowStartedAt: null },
              { statusRequestWindowStartedAt: { lt: windowCutoff } },
            ],
          },
          data: {
            statusRequestCount: 1,
            statusRequestWindowStartedAt: now,
          },
        });
    return updated.count === 1;
  }

  private extractPairingCode(
    text: string,
    state: WhatsAppConversationState,
    allowUnpromptedRawCode: boolean,
  ): string | null {
    const prefixed = /^(?:PAIR|TAUTKAN(?:\s+WHATSAPP)?)\s+(.+)$/i.exec(
      text.trim(),
    );
    if (prefixed?.[1]) return prefixed[1].trim();
    if (
      (state === WhatsAppConversationState.AWAITING_PAIRING ||
        allowUnpromptedRawCode) &&
      /^[A-Za-z0-9_-]{20,80}$/.test(text.trim())
    ) {
      return text.trim();
    }
    return null;
  }

  private isLinked(identity: {
    userId: string | null;
    verifiedAt: Date | null;
    status: string;
  }): boolean {
    return Boolean(
      identity.userId && identity.verifiedAt && identity.status === 'ACTIVE',
    );
  }

  private isNotificationEligible(identity: {
    verifiedAt: Date | null;
    status: string;
  }): boolean {
    return Boolean(identity.verifiedAt && identity.status === 'ACTIVE');
  }

  private isGreeting(command: string): boolean {
    return [
      'HAI',
      'HALO',
      'SELAMAT PAGI',
      'SELAMAT SIANG',
      'SELAMAT SORE',
      'SELAMAT MALAM',
    ].includes(command);
  }

  private safeErrorCode(error: unknown): string {
    if (error instanceof Error && error.name === 'WhatsAppProviderError') {
      return 'PROVIDER_ERROR';
    }
    return 'INBOUND_PROCESSING_ERROR';
  }
}
