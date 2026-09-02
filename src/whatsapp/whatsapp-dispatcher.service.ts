import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  WhatsAppConsentPurpose,
  WhatsAppDeliveryStatus,
  WhatsAppIdentityStatus,
  WhatsAppInboundStatus,
  WhatsAppOutboxStatus,
  WhatsAppPairingStatus,
  RekomtekExposeStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppConfig } from './whatsapp.config';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';
import {
  WHATSAPP_PROVIDER,
  WhatsAppProviderError,
  type WhatsAppProviderPort,
  type WhatsAppSessionHealth,
} from './whatsapp.types';
import { WhatsAppMetricsService } from './whatsapp-metrics.service';

@Injectable()
export class WhatsAppDispatcherService {
  private readonly logger = new Logger(WhatsAppDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfig,
    private readonly outbox: WhatsAppOutboxService,
    @Inject(WHATSAPP_PROVIDER)
    private readonly provider: WhatsAppProviderPort,
    @Optional() private readonly metrics?: WhatsAppMetricsService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async dispatchScheduled(): Promise<void> {
    await this.outbox.enqueueExposeReminders();
    await this.dispatchBatch();
  }

  async getHealth() {
    if (!this.config.enabled) {
      return {
        enabled: false,
        reachable: false,
        session: null,
        status: 'DISABLED',
        engine: null,
        isWorking: false,
        reachoutTimelockActive: false,
        messageCappingStatus: null,
        webhookAuthMode: this.config.webhookAuthMode,
        observedAt: null,
      };
    }
    try {
      const health = await this.provider.getSessionHealth();
      return {
        enabled: true,
        reachable: true,
        session: health.session,
        status: health.status,
        engine: health.engine,
        isWorking: health.isWorking,
        reachoutTimelockActive: health.reachoutTimelockActive,
        messageCappingStatus: health.messageCappingStatus,
        webhookAuthMode: this.config.webhookAuthMode,
        observedAt: health.observedAt,
      };
    } catch (error) {
      return {
        enabled: true,
        reachable: false,
        session: this.config.wahaSession || null,
        status: 'UNREACHABLE',
        engine: null,
        isWorking: false,
        reachoutTimelockActive: false,
        messageCappingStatus: null,
        webhookAuthMode: this.config.webhookAuthMode,
        errorCode: this.safeProviderErrorCode(error),
        observedAt: new Date(),
      };
    }
  }

  @Cron('0 0 3 * * *')
  async cleanupExpiredData(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(
      Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1_000,
    );
    await this.prisma.whatsAppPairingCode.updateMany({
      where: {
        status: WhatsAppPairingStatus.PENDING,
        expiresAt: { lt: now },
      },
      data: { status: WhatsAppPairingStatus.EXPIRED },
    });
    await this.prisma.whatsAppPairingCode.deleteMany({
      where: {
        status: {
          in: [WhatsAppPairingStatus.EXPIRED, WhatsAppPairingStatus.REVOKED],
        },
        createdAt: { lt: cutoff },
      },
    });
    await this.prisma.whatsAppInboundEvent.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        status: {
          in: [
            WhatsAppInboundStatus.PROCESSED,
            WhatsAppInboundStatus.IGNORED,
            WhatsAppInboundStatus.FAILED,
          ],
        },
      },
    });
    await this.prisma.whatsAppDeliveryEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    await this.prisma.whatsAppOutboxSkipEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    await this.prisma.whatsAppOutbox.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        status: {
          in: [
            WhatsAppOutboxStatus.SENT,
            WhatsAppOutboxStatus.DELIVERED,
            WhatsAppOutboxStatus.READ,
            WhatsAppOutboxStatus.FAILED,
            WhatsAppOutboxStatus.DEAD,
            WhatsAppOutboxStatus.CANCELLED,
            WhatsAppOutboxStatus.STALE,
          ],
        },
      },
    });
  }

  async dispatchBatch(): Promise<{ claimed: number; completed: number }> {
    if (!this.config.enabled) return { claimed: 0, completed: 0 };
    const lockOwner = await this.acquireDispatchLock();
    if (!lockOwner) return { claimed: 0, completed: 0 };
    try {
      return await this.dispatchBatchLocked();
    } finally {
      await this.releaseDispatchLock(lockOwner);
    }
  }

  private async dispatchBatchLocked(): Promise<{
    claimed: number;
    completed: number;
  }> {
    try {
      const health = await this.provider.getSessionHealth();
      if (!health.isWorking) {
        this.logger.warn(
          `WAHA session ${health.session} belum siap (${health.status})`,
        );
        this.metrics?.increment('outbox_deferred');
        return { claimed: 0, completed: 0 };
      }
    } catch (error) {
      this.logger.warn(
        `Health check WAHA gagal: ${this.safeProviderErrorCode(error)}`,
      );
      if (
        error instanceof WhatsAppProviderError &&
        error.kind === 'PERMANENT'
      ) {
        await this.deadLetterQueuedWork(error);
      }
      return { claimed: 0, completed: 0 };
    }
    const now = new Date();
    const candidates = await this.prisma.whatsAppOutbox.findMany({
      where: {
        provider: 'waha',
        OR: [
          {
            status: {
              in: [WhatsAppOutboxStatus.PENDING, WhatsAppOutboxStatus.RETRY],
            },
            nextAttemptAt: { lte: now },
          },
          {
            status: WhatsAppOutboxStatus.PROCESSING,
            leaseUntil: { lt: now },
          },
        ],
      },
      select: { id: true },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: this.config.outboxBatchSize,
    });

    let claimed = 0;
    let completed = 0;
    for (const candidate of candidates) {
      const lockedBy = randomUUID();
      const leaseUntil = this.sendLeaseUntil(new Date());
      const result = await this.prisma.whatsAppOutbox.updateMany({
        where: {
          id: candidate.id,
          provider: 'waha',
          OR: [
            {
              status: {
                in: [WhatsAppOutboxStatus.PENDING, WhatsAppOutboxStatus.RETRY],
              },
              nextAttemptAt: { lte: now },
            },
            {
              status: WhatsAppOutboxStatus.PROCESSING,
              leaseUntil: { lt: now },
            },
          ],
        },
        data: {
          status: WhatsAppOutboxStatus.PROCESSING,
          lockedBy,
          leaseUntil,
        },
      });
      if (result.count !== 1) continue;
      claimed += 1;
      this.metrics?.increment('outbox_claimed');
      if (await this.processOne(candidate.id, lockedBy)) completed += 1;
    }
    return { claimed, completed };
  }

  async recordDeliveryStatus(input: {
    providerEventId: string;
    providerMessageId: string;
    ack: number;
    ackName?: string;
    providerTimestamp?: Date | null;
  }): Promise<boolean> {
    const mapped = this.mapAck(input.ack);
    if (!mapped) return false;
    this.metrics?.increment('delivery_ack');
    const outbox = await this.prisma.whatsAppOutbox.findUnique({
      where: { providerMessageId: input.providerMessageId },
      select: { id: true, status: true },
    });
    let existingDelivery: {
      id: string;
      outboxId: string | null;
      providerAck: number | null;
      providerTimestamp: Date | null;
    } | null = null;
    try {
      await this.prisma.whatsAppDeliveryEvent.create({
        data: {
          outboxId: outbox?.id ?? null,
          providerEventId: input.providerEventId,
          providerMessageId: input.providerMessageId,
          status: mapped,
          providerStatus: input.ackName?.slice(0, 100) ?? String(input.ack),
          providerAck: input.ack,
          providerTimestamp: input.providerTimestamp ?? null,
        },
      });
    } catch (error) {
      if (!this.isUniqueError(error)) throw error;
      existingDelivery = await this.prisma.whatsAppDeliveryEvent.findUnique({
        where: { providerEventId: input.providerEventId },
        select: {
          id: true,
          outboxId: true,
          providerAck: true,
          providerTimestamp: true,
        },
      });
      if (!existingDelivery) return true;
    }

    const effectiveOutbox = outbox;
    if (!effectiveOutbox && existingDelivery?.outboxId) {
      const linkedOutbox = await this.prisma.whatsAppOutbox.findUnique({
        where: { id: existingDelivery.outboxId },
        select: { id: true, status: true },
      });
      if (!linkedOutbox) return true;
      return this.advanceDeliveryStatus(
        linkedOutbox.id,
        linkedOutbox.status,
        existingDelivery.providerAck === null
          ? mapped
          : (this.mapAck(existingDelivery.providerAck) ?? mapped),
        existingDelivery.providerTimestamp ?? input.providerTimestamp,
      );
    }
    if (!effectiveOutbox) return true;

    if (existingDelivery?.outboxId === null) {
      await this.prisma.whatsAppDeliveryEvent.updateMany({
        where: { id: existingDelivery.id, outboxId: null },
        data: { outboxId: effectiveOutbox.id },
      });
    }
    return this.advanceDeliveryStatus(
      effectiveOutbox.id,
      effectiveOutbox.status,
      existingDelivery?.providerAck === null || existingDelivery === null
        ? mapped
        : (this.mapAck(existingDelivery.providerAck) ?? mapped),
      existingDelivery?.providerTimestamp ?? input.providerTimestamp,
    );
  }

  private async advanceDeliveryStatus(
    outboxId: string,
    currentStatus: WhatsAppOutboxStatus,
    mapped: WhatsAppDeliveryStatus,
    providerTimestamp?: Date | null,
  ): Promise<boolean> {
    if (currentStatus === WhatsAppOutboxStatus.READ) return true;
    if (mapped === WhatsAppDeliveryStatus.PENDING) return true;
    if (mapped === WhatsAppDeliveryStatus.FAILED) {
      if (currentStatus === WhatsAppOutboxStatus.DELIVERED) return true;
      await this.prisma.whatsAppOutbox.updateMany({
        where: {
          id: outboxId,
          status: {
            in: [
              WhatsAppOutboxStatus.PENDING,
              WhatsAppOutboxStatus.PROCESSING,
              WhatsAppOutboxStatus.SENT,
              WhatsAppOutboxStatus.RETRY,
            ],
          },
        },
        data: {
          status: WhatsAppOutboxStatus.FAILED,
          failedAt: providerTimestamp ?? new Date(),
          lastErrorCode: 'WAHA_ACK_ERROR',
        },
      });
      return true;
    }
    const nextStatus = this.outboxStatusForDelivery(mapped);
    if (
      this.outboxStatusRank(currentStatus) >= this.outboxStatusRank(nextStatus)
    ) {
      return true;
    }
    await this.prisma.whatsAppOutbox.updateMany({
      where: {
        id: outboxId,
        status: {
          in: [
            WhatsAppOutboxStatus.PENDING,
            WhatsAppOutboxStatus.PROCESSING,
            WhatsAppOutboxStatus.SENT,
            WhatsAppOutboxStatus.DELIVERED,
            WhatsAppOutboxStatus.RETRY,
          ],
        },
      },
      data: {
        status: nextStatus,
        ...(mapped === WhatsAppDeliveryStatus.DELIVERED
          ? { deliveredAt: providerTimestamp ?? new Date() }
          : {}),
        ...(mapped === WhatsAppDeliveryStatus.READ
          ? { readAt: providerTimestamp ?? new Date() }
          : {}),
      },
    });
    return true;
  }

  private async reconcilePendingDeliveryEvents(
    outboxId: string,
    providerMessageId: string,
  ): Promise<void> {
    const events = await this.prisma.whatsAppDeliveryEvent.findMany({
      where: { providerMessageId, outboxId: null },
      select: {
        id: true,
        providerAck: true,
        providerTimestamp: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const event of events) {
      const linked = await this.prisma.whatsAppDeliveryEvent.updateMany({
        where: { id: event.id, outboxId: null },
        data: { outboxId },
      });
      if (linked.count !== 1 || event.providerAck === null) continue;
      const current = await this.prisma.whatsAppOutbox.findUnique({
        where: { id: outboxId },
        select: { status: true },
      });
      const mapped = this.mapAck(event.providerAck);
      if (current && mapped) {
        await this.advanceDeliveryStatus(
          outboxId,
          current.status,
          mapped,
          event.providerTimestamp,
        );
      }
    }
  }

  private async processOne(id: string, lockedBy: string): Promise<boolean> {
    const outbox = await this.prisma.whatsAppOutbox.findUnique({
      where: { id },
      include: {
        recipientIdentity: {
          include: {
            user: { select: { isActive: true } },
            consents: true,
            conversation: true,
          },
        },
      },
    });
    if (!outbox) return false;

    const identity = outbox.recipientIdentity;
    const linkedUserIneligible =
      identity.userId !== null && identity.user?.isActive !== true;
    if (
      identity.status !== WhatsAppIdentityStatus.ACTIVE ||
      !identity.verifiedAt ||
      linkedUserIneligible
    ) {
      await this.markCancelled(id, lockedBy, 'IDENTITY_NOT_ELIGIBLE');
      return true;
    }

    if (outbox.purpose === WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL) {
      const consent = identity.consents.find(
        (item) =>
          item.purpose === WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL &&
          item.active,
      );
      if (!consent) {
        await this.markCancelled(id, lockedBy, 'CONSENT_REVOKED');
        return true;
      }
    }

    if (
      outbox.purpose === WhatsAppConsentPurpose.SERVICE_CONVERSATION &&
      outbox.consentRequired
    ) {
      const consent = identity.consents.find(
        (item) =>
          item.purpose === WhatsAppConsentPurpose.SERVICE_CONVERSATION &&
          item.active,
      );
      if (!consent) {
        await this.markCancelled(id, lockedBy, 'CONSENT_REVOKED');
        return true;
      }
    }

    if (outbox.scheduleId) {
      const schedule = await this.prisma.rekomtekExposeSchedule.findUnique({
        where: { id: outbox.scheduleId },
        select: {
          status: true,
          scheduleVersion: true,
          startsAt: true,
          responsibleUserId: true,
          participants: true,
        },
      });
      if (
        !schedule ||
        schedule.status !== RekomtekExposeStatus.TERJADWAL ||
        schedule.scheduleVersion !== outbox.scheduleVersion ||
        schedule.startsAt <= new Date() ||
        !this.scheduleContainsRecipient(schedule, identity)
      ) {
        await this.markStatus(
          id,
          lockedBy,
          WhatsAppOutboxStatus.STALE,
          'STALE_SCHEDULE',
        );
        return true;
      }
    }

    let providerSendAccepted = false;
    let providerMessageId: string | null = null;
    let sendStartedAt: Date | null = null;
    try {
      let health: WhatsAppSessionHealth;
      try {
        health = await this.provider.getSessionHealth();
      } catch (error) {
        await this.deferProcessing(
          id,
          lockedBy,
          this.safeProviderErrorCode(error),
        );
        return true;
      }
      if (!health.isWorking) {
        await this.deferProcessing(id, lockedBy, 'SESSION_NOT_WORKING');
        return true;
      }
      if (!outbox.textBody?.trim()) {
        throw new WhatsAppProviderError(
          'Isi pesan WhatsApp kosong',
          'PERMANENT',
          'MESSAGE_BODY_EMPTY',
        );
      }
      const requiresConsent =
        outbox.purpose === WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL ||
        (outbox.purpose === WhatsAppConsentPurpose.SERVICE_CONVERSATION &&
          outbox.consentRequired);
      const reservationStartedAt = new Date();
      const reservation = await this.prisma.whatsAppOutbox.updateMany({
        where: {
          id,
          lockedBy,
          status: WhatsAppOutboxStatus.PROCESSING,
          recipientIdentity: {
            status: WhatsAppIdentityStatus.ACTIVE,
            verifiedAt: { not: null },
            OR: [{ user: { isActive: true } }, { userId: null }],
            ...(requiresConsent
              ? {
                  consents: {
                    some: {
                      purpose: outbox.purpose,
                      active: true,
                    },
                  },
                }
              : {}),
          },
        },
        data: {
          sendStartedAt: reservationStartedAt,
          leaseUntil: this.sendLeaseUntil(reservationStartedAt),
        },
      });
      if (reservation.count !== 1) {
        await this.markCancelled(id, lockedBy, 'CONSENT_REVOKED');
        return true;
      }
      sendStartedAt = reservationStartedAt;
      this.metrics?.increment('outbox_attempt');
      const result = await this.provider.sendText({
        to: identity.phoneE164,
        text: outbox.textBody,
      });
      providerSendAccepted = true;
      providerMessageId = result.providerMessageId;
      const persisted = await this.prisma.whatsAppOutbox.updateMany({
        where: {
          id,
          lockedBy,
          status: WhatsAppOutboxStatus.PROCESSING,
          sendStartedAt,
        },
        data: {
          status: WhatsAppOutboxStatus.SENT,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          leaseUntil: null,
          lockedBy: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (persisted.count !== 1) {
        await this.quarantineAcceptedSend(
          id,
          sendStartedAt,
          result.providerMessageId,
        );
        return true;
      }
      await this.reconcilePendingDeliveryEvents(id, result.providerMessageId);
      await this.prisma.whatsAppConversation.updateMany({
        where: { identityId: identity.id },
        data: { lastOutboundAt: new Date(), lastMessageAt: new Date() },
      });
      return true;
    } catch (error) {
      if (providerSendAccepted && providerMessageId && sendStartedAt) {
        await this.quarantineAcceptedSend(id, sendStartedAt, providerMessageId);
      } else {
        await this.handleFailure(outbox, lockedBy, error);
      }
      return true;
    }
  }

  private async deferProcessing(
    id: string,
    lockedBy: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.whatsAppOutbox.updateMany({
      where: {
        id,
        lockedBy,
        status: WhatsAppOutboxStatus.PROCESSING,
      },
      data: {
        status: WhatsAppOutboxStatus.PENDING,
        nextAttemptAt: new Date(
          Date.now() +
            Math.max(this.config.sessionHealthCacheMs ?? 10_000, 5_000),
        ),
        leaseUntil: null,
        lockedBy: null,
        lastErrorCode: reason,
        lastErrorMessage: null,
      },
    });
    this.metrics?.increment('outbox_deferred');
  }

  private async deadLetterQueuedWork(
    error: WhatsAppProviderError,
  ): Promise<void> {
    const result = await this.prisma.whatsAppOutbox.updateMany({
      where: {
        provider: 'waha',
        status: {
          in: [WhatsAppOutboxStatus.PENDING, WhatsAppOutboxStatus.RETRY],
        },
      },
      data: {
        status: WhatsAppOutboxStatus.DEAD,
        failedAt: new Date(),
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lockedBy: null,
        lastErrorCode: error.code.slice(0, 100),
        lastErrorMessage: error.message.slice(0, 500),
      },
    });
    if (result.count > 0) {
      this.metrics?.increment('outbox_dead');
      this.logger.warn(
        `WhatsApp outbox dikarantina karena health WAHA permanen (${error.code})`,
      );
    }
  }

  private sendLeaseUntil(startedAt: Date): Date {
    const networkBudgetMs =
      (this.config.connectTimeoutMs ?? 5_000) +
      (this.config.responseTimeoutMs ?? 10_000);
    return new Date(startedAt.getTime() + networkBudgetMs + 30_000);
  }

  private async quarantineAcceptedSend(
    id: string,
    sendStartedAt: Date,
    providerMessageId: string,
  ): Promise<void> {
    const quarantined = await this.prisma.whatsAppOutbox.updateMany({
      where: {
        id,
        provider: 'waha',
        providerMessageId: null,
        sendStartedAt,
        status: {
          in: [
            WhatsAppOutboxStatus.PROCESSING,
            WhatsAppOutboxStatus.PENDING,
            WhatsAppOutboxStatus.RETRY,
            WhatsAppOutboxStatus.CANCELLED,
          ],
        },
      },
      data: {
        status: WhatsAppOutboxStatus.DEAD,
        providerMessageId,
        failedAt: new Date(),
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lockedBy: null,
        lastErrorCode: 'PROVIDER_RESULT_PERSISTENCE_UNKNOWN',
        lastErrorMessage:
          'Provider menerima pesan, tetapi status lokal perlu rekonsiliasi manual',
      },
    });
    if (quarantined.count === 1) {
      this.metrics?.increment('outbox_dead');
      this.logger.warn(
        `WhatsApp outbox ${id} dikarantina setelah provider menerima pesan`,
      );
      return;
    }

    const current = await this.prisma.whatsAppOutbox.findUnique({
      where: { id },
      select: { providerMessageId: true },
    });
    if (current?.providerMessageId === providerMessageId) return;
    this.logger.error(
      `WhatsApp outbox ${id} tidak dapat mengunci hasil send yang ambigu`,
    );
  }

  private async handleFailure(
    outbox: {
      id: string;
      attemptCount: number;
      maxAttempts: number;
    },
    lockedBy: string,
    error: unknown,
  ): Promise<void> {
    const providerError = error instanceof WhatsAppProviderError ? error : null;
    const nextAttempt = outbox.attemptCount + 1;
    const permanent = providerError?.kind === 'PERMANENT';
    const unknown = providerError?.kind === 'UNKNOWN';
    const dead = permanent || unknown || nextAttempt >= outbox.maxAttempts;
    const errorCode = providerError?.code ?? 'DISPATCH_ERROR';
    const errorMessage = providerError?.message ?? 'Pengiriman WhatsApp gagal';
    await this.prisma.whatsAppOutbox.updateMany({
      where: {
        id: outbox.id,
        lockedBy,
        status: WhatsAppOutboxStatus.PROCESSING,
      },
      data: {
        attemptCount: nextAttempt,
        status: dead ? WhatsAppOutboxStatus.DEAD : WhatsAppOutboxStatus.RETRY,
        nextAttemptAt: dead
          ? new Date()
          : new Date(
              Date.now() +
                (providerError?.retryAfterMs ?? this.backoffMs(nextAttempt)),
            ),
        leaseUntil: null,
        lockedBy: null,
        lastErrorCode: errorCode.slice(0, 100),
        lastErrorMessage: errorMessage.slice(0, 500),
        ...(dead ? { failedAt: new Date() } : {}),
      },
    });
    if (dead) this.metrics?.increment('outbox_dead');
    this.logger.warn(`WhatsApp outbox ${outbox.id} gagal: ${errorCode}`);
  }

  private async markCancelled(
    id: string,
    lockedBy: string,
    reason: string,
  ): Promise<void> {
    await this.markStatus(id, lockedBy, WhatsAppOutboxStatus.CANCELLED, reason);
  }

  private async markStatus(
    id: string,
    lockedBy: string,
    status: WhatsAppOutboxStatus,
    reason: string,
  ): Promise<void> {
    await this.prisma.whatsAppOutbox.updateMany({
      where: {
        id,
        lockedBy,
        status: WhatsAppOutboxStatus.PROCESSING,
        sendStartedAt: null,
      },
      data: {
        status,
        leaseUntil: null,
        lockedBy: null,
        lastErrorCode: reason,
        lastErrorMessage: null,
      },
    });
  }

  private backoffMs(attempt: number): number {
    const base = Math.min(3_600_000, 1_000 * 2 ** Math.min(attempt, 10));
    return base + Math.floor(Math.random() * 250);
  }

  private mapAck(ack: number): WhatsAppDeliveryStatus | null {
    switch (ack) {
      case -1:
        return WhatsAppDeliveryStatus.FAILED;
      case 0:
        return WhatsAppDeliveryStatus.PENDING;
      case 1:
        return WhatsAppDeliveryStatus.SENT;
      case 2:
        return WhatsAppDeliveryStatus.DELIVERED;
      case 3:
      case 4:
        return WhatsAppDeliveryStatus.READ;
      default:
        return null;
    }
  }

  private outboxStatusForDelivery(
    status: WhatsAppDeliveryStatus,
  ): WhatsAppOutboxStatus {
    switch (status) {
      case WhatsAppDeliveryStatus.SENT:
        return WhatsAppOutboxStatus.SENT;
      case WhatsAppDeliveryStatus.DELIVERED:
        return WhatsAppOutboxStatus.DELIVERED;
      case WhatsAppDeliveryStatus.READ:
        return WhatsAppOutboxStatus.READ;
      case WhatsAppDeliveryStatus.FAILED:
        return WhatsAppOutboxStatus.FAILED;
      default:
        return WhatsAppOutboxStatus.PROCESSING;
    }
  }

  private async acquireDispatchLock(): Promise<string | null> {
    const lock = this.dispatchLockModel();
    if (!lock) return 'local-test-lock';
    const name = `WAHA:${this.config.wahaSession}`;
    const lockedBy = randomUUID();
    const now = new Date();
    await lock.upsert({
      where: { name },
      create: { name, lockedUntil: new Date(0), lockedBy: null },
      update: {},
    });
    const estimatedBatchMs =
      ((this.config.connectTimeoutMs ?? 5_000) +
        (this.config.responseTimeoutMs ?? 10_000)) *
        Math.max(1, this.config.outboxBatchSize ?? 25) +
      (this.config.sendMinIntervalMs ?? 0) *
        Math.max(1, this.config.outboxBatchSize ?? 25) +
      10_000;
    const lockedUntil = new Date(
      now.getTime() +
        Math.max(this.config.dispatchLockTtlMs ?? 120_000, estimatedBatchMs),
    );
    const result = await lock.updateMany({
      where: {
        name,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil, lockedBy },
    });
    return result.count === 1 ? lockedBy : null;
  }

  private async releaseDispatchLock(lockedBy: string): Promise<void> {
    if (lockedBy === 'local-test-lock') return;
    const lock = this.dispatchLockModel();
    if (!lock) return;
    await lock.updateMany({
      where: { lockedBy },
      data: { lockedUntil: null, lockedBy: null },
    });
  }

  private dispatchLockModel(): {
    upsert(input: unknown): Promise<unknown>;
    updateMany(input: unknown): Promise<{ count: number }>;
  } | null {
    const candidate = (
      this.prisma as unknown as {
        whatsAppDispatchLock?: unknown;
      }
    ).whatsAppDispatchLock;
    if (typeof candidate !== 'object' || candidate === null) return null;
    return candidate as {
      upsert(input: unknown): Promise<unknown>;
      updateMany(input: unknown): Promise<{ count: number }>;
    };
  }

  private outboxStatusRank(status: WhatsAppOutboxStatus): number {
    switch (status) {
      case WhatsAppOutboxStatus.READ:
        return 4;
      case WhatsAppOutboxStatus.DELIVERED:
        return 3;
      case WhatsAppOutboxStatus.SENT:
        return 2;
      case WhatsAppOutboxStatus.PROCESSING:
      case WhatsAppOutboxStatus.RETRY:
      case WhatsAppOutboxStatus.PENDING:
        return 1;
      default:
        return 0;
    }
  }

  private scheduleContainsRecipient(
    schedule: { responsibleUserId: string; participants: Prisma.JsonValue },
    identity: { userId: string | null; phoneE164: string },
  ): boolean {
    if (identity.userId === schedule.responsibleUserId) return true;
    if (!Array.isArray(schedule.participants)) return false;
    return schedule.participants.some((participant) => {
      if (typeof participant === 'string')
        return participant === identity.userId;
      if (typeof participant !== 'object' || participant === null) return false;
      const record = participant as Record<string, unknown>;
      return (
        record.type === 'EXTERNAL' &&
        record.whatsappNumber === identity.phoneE164
      );
    });
  }

  private safeProviderErrorCode(error: unknown): string {
    return error instanceof WhatsAppProviderError ? error.code : 'HEALTH_ERROR';
  }

  private isUniqueError(error: unknown): boolean {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002') ||
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002')
    );
  }
}
