import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  Prisma,
  WhatsAppConsentPurpose,
  WhatsAppConsentSource,
  WhatsAppIdentityStatus,
  WhatsAppOutboxStatus,
  WhatsAppPairingStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppConfig } from './whatsapp.config';
import {
  hashPairingCode,
  normalizePairingCode,
  normalizeWhatsAppPhone,
} from './whatsapp-security';
import { WhatsAppMetricsService } from './whatsapp-metrics.service';

const GENERIC_PAIRING_ERROR = 'Kode penautan tidak valid atau kedaluwarsa.';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class WhatsAppIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfig,
    @Optional() private readonly metrics?: WhatsAppMetricsService,
  ) {}

  normalizePhone(value: string, allowBareInternational = false): string {
    return normalizeWhatsAppPhone(value, this.config.defaultCountryCode, {
      allowBareInternational,
    });
  }

  async createPairingCode(userId: string): Promise<{
    code: string;
    expiresAt: Date;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!user?.isActive) throw new NotFoundException('Akun tidak ditemukan');

    const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.pairingTtlMinutes * 60_000,
    );
    const recentCutoff = new Date(
      Date.now() - this.config.pairingRateWindowMinutes * 60_000,
    );
    await this.prisma.$transaction(
      async (tx) => {
        const activeUser = await tx.user.findUnique({
          where: { id: userId },
          select: { isActive: true },
        });
        if (!activeUser?.isActive) {
          throw new NotFoundException('Akun tidak ditemukan');
        }
        const recentCount = await tx.whatsAppPairingCode.count({
          where: { userId, createdAt: { gte: recentCutoff } },
        });
        if (recentCount >= this.config.pairingRateLimit) {
          throw new HttpException(
            'Terlalu banyak pembuatan kode penautan. Silakan coba lagi nanti.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        await tx.whatsAppPairingCode.updateMany({
          where: { userId, status: WhatsAppPairingStatus.PENDING },
          data: {
            status: WhatsAppPairingStatus.REVOKED,
            revokedAt: new Date(),
          },
        });
        await tx.whatsAppPairingCode.create({
          data: {
            userId,
            codeHash: hashPairingCode(code),
            expiresAt,
            maxAttempts: this.config.pairingMaxAttempts,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return { code, expiresAt };
  }

  async getStatusForUser(userId: string) {
    const identity = await this.prisma.whatsAppIdentity.findUnique({
      where: { userId },
      include: { consents: true },
    });
    return {
      linked: Boolean(
        identity?.status === WhatsAppIdentityStatus.ACTIVE &&
        identity.verifiedAt,
      ),
      phoneE164: identity?.phoneE164 ?? null,
      verifiedAt: identity?.verifiedAt ?? null,
      linkedAt: identity?.linkedAt ?? null,
      status: identity?.status ?? null,
      consents:
        identity?.consents.map((consent) => ({
          purpose: consent.purpose,
          active: consent.active,
          source: consent.source,
          textVersion: consent.textVersion,
          optedInAt: consent.optedInAt,
          optedOutAt: consent.optedOutAt,
        })) ?? [],
    };
  }

  async setConsentForUser(
    userId: string,
    purpose: WhatsAppConsentPurpose,
    active: boolean,
  ) {
    const identity = await this.requireVerifiedIdentityForUser(userId);
    const consent = await this.setConsentForIdentity(
      identity.id,
      purpose,
      active,
      WhatsAppConsentSource.WEB,
      userId,
    );
    return this.serializeConsent(consent);
  }

  async setConsentForIdentity(
    identityId: string,
    purpose: WhatsAppConsentPurpose,
    active: boolean,
    source: WhatsAppConsentSource,
    actorUserId?: string,
  ) {
    const now = new Date();
    const consent = await this.prisma.$transaction(async (tx) => {
      const nextConsent = await tx.whatsAppConsent.upsert({
        where: { identityId_purpose: { identityId, purpose } },
        create: {
          identityId,
          purpose,
          active,
          source,
          textVersion: this.config.consentTextVersion,
          actorUserId: actorUserId ?? null,
          optedInAt: active ? now : null,
          optedOutAt: active ? null : now,
        },
        update: {
          active,
          source,
          textVersion: this.config.consentTextVersion,
          actorUserId: actorUserId ?? null,
          ...(active
            ? { optedInAt: now, optedOutAt: null }
            : { optedOutAt: now }),
        },
      });
      if (!active) {
        await tx.whatsAppOutbox.updateMany({
          where: {
            recipientIdentityId: identityId,
            purpose,
            OR: [
              {
                status: {
                  in: [
                    WhatsAppOutboxStatus.PENDING,
                    WhatsAppOutboxStatus.RETRY,
                  ],
                },
              },
              {
                status: WhatsAppOutboxStatus.PROCESSING,
                sendStartedAt: null,
              },
            ],
          },
          data: {
            status: WhatsAppOutboxStatus.CANCELLED,
            leaseUntil: null,
            lockedBy: null,
            lastErrorCode: 'CONSENT_REVOKED',
          },
        });
      }
      await tx.whatsAppConsentAuditEvent.create({
        data: {
          identityId,
          purpose,
          active,
          source,
          textVersion: this.config.consentTextVersion,
          actorUserId: actorUserId ?? null,
        },
      });
      return nextConsent;
    });
    this.metrics?.increment(active ? 'consent_opt_in' : 'consent_opt_out');
    return consent;
  }

  async optOutIdentity(identityId: string): Promise<void> {
    const now = new Date();
    const identity = await this.prisma.whatsAppIdentity.findUnique({
      where: { id: identityId },
      select: { userId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.whatsAppConsent.updateMany({
        where: { identityId, active: true },
        data: {
          active: false,
          optedOutAt: now,
          actorUserId: identity?.userId ?? null,
        },
      });
      await tx.whatsAppConsentAuditEvent.createMany({
        data: [
          WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
          WhatsAppConsentPurpose.SERVICE_CONVERSATION,
        ].map((purpose) => ({
          identityId,
          purpose,
          active: false,
          source: WhatsAppConsentSource.WHATSAPP,
          textVersion: this.config.consentTextVersion,
          actorUserId: identity?.userId ?? null,
        })),
      });
      await tx.whatsAppOutbox.updateMany({
        where: {
          recipientIdentityId: identityId,
          OR: [
            {
              status: {
                in: [WhatsAppOutboxStatus.PENDING, WhatsAppOutboxStatus.RETRY],
              },
            },
            {
              status: WhatsAppOutboxStatus.PROCESSING,
              sendStartedAt: null,
            },
          ],
        },
        data: {
          status: WhatsAppOutboxStatus.CANCELLED,
          leaseUntil: null,
          lockedBy: null,
          lastErrorCode: 'CONSENT_REVOKED',
        },
      });
      await tx.whatsAppConversation.updateMany({
        where: { identityId },
        data: { state: 'MENU', stateExpiresAt: null },
      });
    });
    this.metrics?.increment('consent_opt_out');
  }

  async unlinkUser(userId: string): Promise<void> {
    const identity = await this.prisma.whatsAppIdentity.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!identity) return;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.whatsAppIdentity.update({
        where: { id: identity.id },
        data: {
          userId: null,
          status: WhatsAppIdentityStatus.UNLINKED,
          verifiedAt: null,
          unlinkedAt: now,
        },
      });
      await tx.whatsAppIdentityAuditEvent.create({
        data: {
          identityId: identity.id,
          action: 'UNLINKED',
          actorUserId: userId,
          metadata: { source: 'WEB' },
        },
      });
      await tx.whatsAppConsent.updateMany({
        where: { identityId: identity.id, active: true },
        data: { active: false, optedOutAt: now, actorUserId: userId },
      });
      await tx.whatsAppConsentAuditEvent.createMany({
        data: [
          WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
          WhatsAppConsentPurpose.SERVICE_CONVERSATION,
        ].map((purpose) => ({
          identityId: identity.id,
          purpose,
          active: false,
          source: WhatsAppConsentSource.WEB,
          textVersion: this.config.consentTextVersion,
          actorUserId: userId,
        })),
      });
      await tx.whatsAppOutbox.updateMany({
        where: {
          recipientIdentityId: identity.id,
          OR: [
            {
              status: {
                in: [WhatsAppOutboxStatus.PENDING, WhatsAppOutboxStatus.RETRY],
              },
            },
            {
              status: WhatsAppOutboxStatus.PROCESSING,
              sendStartedAt: null,
            },
          ],
        },
        data: {
          status: WhatsAppOutboxStatus.CANCELLED,
          leaseUntil: null,
          lockedBy: null,
          lastErrorCode: 'WHATSAPP_UNLINKED',
        },
      });
      await tx.whatsAppPairingCode.updateMany({
        where: { userId, status: WhatsAppPairingStatus.PENDING },
        data: { status: WhatsAppPairingStatus.REVOKED, revokedAt: now },
      });
      await tx.whatsAppConversation.updateMany({
        where: { identityId: identity.id },
        data: { state: 'MENU', stateExpiresAt: null },
      });
    });
    this.metrics?.increment('consent_opt_out');
  }

  async getOrCreateIdentity(
    phone: string,
    providerWaId?: string,
    db: DbClient = this.prisma,
  ) {
    const phoneE164 = this.normalizePhone(phone, true);
    const now = new Date();
    const existingByPhone = await db.whatsAppIdentity.findUnique({
      where: { phoneE164 },
    });
    if (
      existingByPhone?.providerWaId &&
      providerWaId &&
      existingByPhone.providerWaId !== providerWaId
    ) {
      throw new ConflictException('Identitas WhatsApp tidak konsisten');
    }
    if (providerWaId) {
      const existingByProvider = await db.whatsAppIdentity.findUnique({
        where: { providerWaId },
      });
      if (existingByProvider && existingByProvider.phoneE164 !== phoneE164) {
        throw new ConflictException('Identitas WhatsApp tidak konsisten');
      }
    }

    return db.whatsAppIdentity.upsert({
      where: { phoneE164 },
      create: {
        phoneE164,
        providerWaId: providerWaId ?? null,
        verifiedAt: providerWaId ? now : null,
        lastSeenAt: now,
      },
      update: {
        ...(providerWaId
          ? {
              providerWaId,
              verifiedAt: existingByPhone?.verifiedAt ?? now,
            }
          : {}),
        lastSeenAt: now,
      },
    });
  }

  async linkPairingCode(
    phone: string,
    providerWaId: string | undefined,
    rawCode: string,
  ): Promise<{ userId: string }> {
    const identity = await this.getOrCreateIdentity(phone, providerWaId);
    if (identity.status === WhatsAppIdentityStatus.BLOCKED) {
      throw new BadRequestException(GENERIC_PAIRING_ERROR);
    }
    await this.registerPairingAttempt(identity.id);

    const codeHash = hashPairingCode(normalizePairingCode(rawCode));
    const now = new Date();
    const pairing = await this.prisma.whatsAppPairingCode.findUnique({
      where: { codeHash },
    });
    if (
      !pairing ||
      pairing.status !== WhatsAppPairingStatus.PENDING ||
      pairing.expiresAt <= now ||
      pairing.attemptCount >= pairing.maxAttempts
    ) {
      if (pairing?.status === WhatsAppPairingStatus.PENDING) {
        await this.prisma.whatsAppPairingCode.update({
          where: { id: pairing.id },
          data: {
            attemptCount: { increment: 1 },
            lastAttemptAt: now,
            ...(pairing.attemptCount + 1 >= pairing.maxAttempts
              ? {
                  status: WhatsAppPairingStatus.REVOKED,
                  revokedAt: now,
                }
              : {}),
          },
        });
      }
      throw new BadRequestException(GENERIC_PAIRING_ERROR);
    }

    if (
      identity.userId &&
      identity.status === WhatsAppIdentityStatus.ACTIVE &&
      identity.userId !== pairing.userId
    ) {
      throw new ConflictException(
        'Nomor WhatsApp sudah tertaut ke akun SIPENGSUI lain',
      );
    }

    const existingUserIdentity = await this.prisma.whatsAppIdentity.findFirst({
      where: {
        userId: pairing.userId,
        status: WhatsAppIdentityStatus.ACTIVE,
        id: { not: identity.id },
      },
      select: { id: true },
    });
    if (existingUserIdentity) {
      throw new ConflictException(
        'Akun SIPENGSUI sudah memiliki WhatsApp yang tertaut',
      );
    }

    const linked = await this.prisma.$transaction(
      async (tx) => {
        const activeOwner = await tx.user.findUnique({
          where: { id: pairing.userId },
          select: { isActive: true },
        });
        if (!activeOwner?.isActive) {
          throw new BadRequestException(GENERIC_PAIRING_ERROR);
        }
        const attached = await tx.whatsAppIdentity.updateMany({
          where: {
            id: identity.id,
            status: {
              in: [
                WhatsAppIdentityStatus.ACTIVE,
                WhatsAppIdentityStatus.UNLINKED,
              ],
            },
            OR: [{ userId: null }, { userId: pairing.userId }],
          },
          data: {
            userId: pairing.userId,
            status: WhatsAppIdentityStatus.ACTIVE,
            verifiedAt: now,
            linkedAt: now,
            unlinkedAt: null,
            providerWaId: providerWaId ?? identity.providerWaId,
          },
        });
        if (attached.count !== 1) {
          throw new ConflictException(
            'Nomor WhatsApp sudah tertaut ke akun SIPENGSUI lain',
          );
        }

        const consumed = await tx.whatsAppPairingCode.updateMany({
          where: {
            id: pairing.id,
            status: WhatsAppPairingStatus.PENDING,
            expiresAt: { gt: now },
            attemptCount: { lt: pairing.maxAttempts },
          },
          data: {
            status: WhatsAppPairingStatus.CONSUMED,
            consumedAt: now,
            lastAttemptAt: now,
          },
        });
        if (consumed.count !== 1) {
          throw new BadRequestException(GENERIC_PAIRING_ERROR);
        }
        const linkedIdentity = await tx.whatsAppIdentity.update({
          where: { id: identity.id },
          data: {
            userId: pairing.userId,
            status: WhatsAppIdentityStatus.ACTIVE,
            verifiedAt: now,
            linkedAt: now,
            unlinkedAt: null,
            providerWaId: providerWaId ?? identity.providerWaId,
          },
        });
        await tx.whatsAppIdentityAuditEvent.create({
          data: {
            identityId: identity.id,
            action: 'LINKED',
            actorUserId: pairing.userId,
            metadata: { source: 'WHATSAPP_PAIRING' },
          },
        });
        return linkedIdentity;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    this.metrics?.increment('pairing_success');
    return { userId: linked.userId! };
  }

  async requireVerifiedIdentityForUser(userId: string) {
    const identity = await this.prisma.whatsAppIdentity.findUnique({
      where: { userId },
    });
    if (
      !identity ||
      identity.status !== WhatsAppIdentityStatus.ACTIVE ||
      !identity.verifiedAt
    ) {
      throw new BadRequestException(
        'Hubungkan dan verifikasi WhatsApp terlebih dahulu',
      );
    }
    return identity;
  }

  async hasActiveConsent(
    identityId: string,
    purpose: WhatsAppConsentPurpose,
    db: DbClient = this.prisma,
  ): Promise<boolean> {
    const consent = await db.whatsAppConsent.findUnique({
      where: { identityId_purpose: { identityId, purpose } },
      select: { active: true },
    });
    return Boolean(consent?.active);
  }

  private async registerPairingAttempt(identityId: string): Promise<void> {
    const now = new Date();
    const identity = await this.prisma.whatsAppIdentity.findUnique({
      where: { id: identityId },
      select: {
        pairingAttemptCount: true,
        pairingAttemptWindowStartedAt: true,
      },
    });
    if (!identity) throw new BadRequestException(GENERIC_PAIRING_ERROR);
    const windowStart = identity.pairingAttemptWindowStartedAt;
    const withinWindow = Boolean(
      windowStart &&
      now.getTime() - windowStart.getTime() <
        this.config.pairingRateWindowMinutes * 60_000,
    );
    const nextCount = withinWindow ? identity.pairingAttemptCount + 1 : 1;
    if (nextCount > this.config.pairingRateLimit) {
      throw new HttpException(
        'Terlalu banyak percobaan penautan. Silakan coba lagi nanti.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const updated = await this.prisma.whatsAppIdentity.updateMany({
      where: {
        id: identityId,
        pairingAttemptCount: identity.pairingAttemptCount,
        pairingAttemptWindowStartedAt: windowStart,
      },
      data: {
        pairingAttemptCount: nextCount,
        pairingAttemptWindowStartedAt: withinWindow ? windowStart : now,
      },
    });
    if (updated.count !== 1) {
      throw new HttpException(
        'Terlalu banyak percobaan penautan. Silakan coba lagi nanti.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private serializeConsent(consent: {
    purpose: WhatsAppConsentPurpose;
    active: boolean;
    source: WhatsAppConsentSource;
    textVersion: string;
    optedInAt: Date | null;
    optedOutAt: Date | null;
  }) {
    return {
      purpose: consent.purpose,
      active: consent.active,
      source: consent.source,
      textVersion: consent.textVersion,
      optedInAt: consent.optedInAt,
      optedOutAt: consent.optedOutAt,
    };
  }
}
