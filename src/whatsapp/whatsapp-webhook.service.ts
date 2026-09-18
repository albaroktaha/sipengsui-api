import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, WhatsAppMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppConfig } from './whatsapp.config';
import { WhatsAppIdentityService } from './whatsapp-identity.service';
import { WhatsAppInboxService } from './whatsapp-inbox.service';
import {
  isWithinClockSkew,
  parseWahaTimestamp,
  parseWahaWebhookTimestamp,
  phoneFromWahaChatId,
  resolveWahaMessageIdentity,
  secureStringEqual,
  verifyWahaSignature,
} from './whatsapp-security';
import { WhatsAppDispatcherService } from './whatsapp-dispatcher.service';
import { WHATSAPP_PROVIDER, type WhatsAppProviderPort } from './whatsapp.types';
import { WhatsAppMetricsService } from './whatsapp-metrics.service';

@Injectable()
export class WhatsAppWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfig,
    private readonly identities: WhatsAppIdentityService,
    private readonly inbox: WhatsAppInboxService,
    private readonly dispatcher: WhatsAppDispatcherService,
    @Inject(WHATSAPP_PROVIDER)
    private readonly provider: WhatsAppProviderPort,
    @Optional() private readonly metrics?: WhatsAppMetricsService,
  ) {}

  async accept(input: {
    rawBody: Buffer | undefined;
    signature?: string;
    algorithm?: string;
    timestamp?: string;
    requestId?: string;
    customSecret?: string;
    contentType?: string;
  }): Promise<{ status: 'accepted' | 'ignored' | 'disabled' }> {
    if (!this.config.enabled) return { status: 'disabled' };
    const rawBody = input.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Body webhook kosong');
    }
    if (rawBody.length > this.config.webhookMaxBodyBytes) {
      throw new BadRequestException('Body webhook terlalu besar');
    }
    if (!input.contentType?.toLowerCase().startsWith('application/json')) {
      throw new BadRequestException(
        'Content-Type webhook harus application/json',
      );
    }
    const requestId = input.requestId;
    if (!requestId || requestId !== requestId.trim()) {
      this.metrics?.increment('webhook_auth_failed');
      throw new BadRequestException('X-Webhook-Request-Id wajib diisi');
    }
    if (requestId.length > 200) {
      this.metrics?.increment('webhook_auth_failed');
      throw new BadRequestException('X-Webhook-Request-Id terlalu panjang');
    }
    if (input.algorithm && input.algorithm !== 'sha512') {
      this.metrics?.increment('webhook_auth_failed');
      throw new BadRequestException(
        'Algoritma webhook harus bernilai tepat sha512',
      );
    }
    if (this.config.wahaWebhookHmacKey && input.algorithm !== 'sha512') {
      this.metrics?.increment('webhook_auth_failed');
      throw new BadRequestException(
        'Algoritma webhook harus bernilai tepat sha512',
      );
    }
    const webhookTimestamp = parseWahaWebhookTimestamp(input.timestamp);
    if (
      !webhookTimestamp ||
      !isWithinClockSkew(
        webhookTimestamp,
        new Date(),
        this.config.webhookMaxClockSkewSeconds,
      )
    ) {
      this.metrics?.increment('webhook_auth_failed');
      throw new UnauthorizedException('Timestamp webhook tidak valid');
    }
    if (this.config.wahaWebhookHmacKey) {
      if (
        !verifyWahaSignature(
          rawBody,
          input.signature,
          input.algorithm,
          this.config.wahaWebhookHmacKey,
        )
      ) {
        this.metrics?.increment('webhook_auth_failed');
        throw new UnauthorizedException('HMAC webhook tidak valid');
      }
    } else if (
      !this.config.wahaWebhookCustomSecret ||
      !secureStringEqual(
        input.customSecret ?? '',
        this.config.wahaWebhookCustomSecret,
      )
    ) {
      this.metrics?.increment('webhook_auth_failed');
      throw new UnauthorizedException('Secret webhook tidak valid');
    }

    this.metrics?.increment('webhook_valid');
    const payload = this.parseBody(rawBody);
    const eventName = this.stringValue(payload.event);
    const session = this.stringValue(payload.session);
    const engine = this.stringValue(payload.engine)?.toUpperCase();
    if (!eventName || !session || session !== this.config.wahaSession) {
      return this.ignored();
    }
    if (
      this.config.wahaExpectedEngine &&
      engine !== this.config.wahaExpectedEngine
    ) {
      return this.ignored();
    }

    const providerPayload = this.asRecord(payload.payload);
    if (eventName === 'session.status') {
      const status = this.stringValue(providerPayload?.status);
      const eventTimestamp = parseWahaTimestamp(payload.timestamp);
      if (
        !status ||
        !eventTimestamp ||
        !isWithinClockSkew(
          eventTimestamp,
          new Date(),
          this.config.webhookMaxClockSkewSeconds,
        )
      ) {
        return this.ignored();
      }
      this.provider.observeSessionStatus({
        session,
        engine,
        status,
        data: providerPayload?.data,
        timestamp: parseWahaTimestamp(payload.timestamp),
      });
      return { status: 'accepted' };
    }

    if (eventName === 'message.ack') {
      const providerMessageId = this.stringValue(providerPayload?.id);
      const from = this.stringValue(providerPayload?.from);
      const ack = this.numberValue(providerPayload?.ack);
      const fromMe = providerPayload?.fromMe;
      if (
        !providerMessageId ||
        !from ||
        phoneFromWahaChatId(from, this.config.defaultCountryCode) === null ||
        fromMe !== true ||
        ack === null
      ) {
        return this.ignored();
      }
      const providerTimestamp = parseWahaTimestamp(
        providerPayload?.timestamp ?? payload.timestamp,
      );
      await this.dispatcher.recordDeliveryStatus({
        providerEventId: this.ackEventId(
          providerMessageId,
          ack,
          providerTimestamp,
        ),
        providerMessageId,
        ack,
        ackName: this.stringValue(providerPayload?.ackName),
        providerTimestamp,
      });
      return { status: 'accepted' };
    }

    if (eventName !== 'message' || !providerPayload) {
      return this.ignored();
    }

    const providerMessageId = this.stringValue(providerPayload.id);
    const from = this.stringValue(providerPayload.from);
    if (
      !providerMessageId ||
      !from ||
      providerPayload.fromMe !== false ||
      providerPayload.source === 'api' ||
      (providerPayload.source !== undefined && providerPayload.source !== 'app')
    ) {
      return this.ignored();
    }
    let phoneIdentity = resolveWahaMessageIdentity(
      providerPayload,
      this.config.defaultCountryCode,
    );
    if (!phoneIdentity && from.endsWith('@lid')) {
      try {
        const phoneE164 = await this.provider.resolveLidPhone(from);
        if (phoneE164) {
          phoneIdentity = {
            phoneE164,
            providerWaId: phoneE164.slice(1),
          };
        }
      } catch {
        // A LID resolution failure must not trust the LID as a phone number.
        // The event is safely ignored and WAHA may retry according to policy.
      }
    }
    if (!phoneIdentity) return this.ignored();

    const existing = await this.prisma.whatsAppInboundEvent.findUnique({
      where: { providerRequestId: requestId },
      select: { id: true },
    });
    if (existing) {
      this.metrics?.increment('webhook_replay');
      return this.ignored();
    }

    const identity = await this.identities.getOrCreateIdentity(
      phoneIdentity.phoneE164,
      phoneIdentity.providerWaId,
    );
    const messageType = this.mapMessageType(providerPayload);
    const text = this.stringValue(providerPayload.body);
    try {
      const inbound = await this.prisma.whatsAppInboundEvent.create({
        data: {
          providerRequestId: requestId,
          eventName,
          sessionName: session,
          providerEngine: engine,
          providerEventId: `${requestId}:message:${providerMessageId}`,
          providerMessageId,
          identityId: identity.id,
          messageType,
          textBody: text?.slice(0, 4_000) ?? null,
          payloadDigest: createHash('sha256').update(rawBody).digest('hex'),
          providerTimestamp: parseWahaTimestamp(providerPayload.timestamp),
        },
        select: { id: true },
      });
      setImmediate(() => {
        void this.inbox.process(inbound.id).catch(() => undefined);
      });
      return { status: 'accepted' };
    } catch (error) {
      if (this.isUniqueError(error)) {
        this.metrics?.increment('webhook_replay');
        return this.ignored();
      }
      throw error;
    }
  }

  private ignored(): { status: 'ignored' } {
    this.metrics?.increment('webhook_ignored');
    return { status: 'ignored' };
  }

  private parseBody(rawBody: Buffer): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      return this.asRecord(parsed) ?? {};
    } catch {
      throw new BadRequestException('JSON webhook tidak valid');
    }
  }

  private mapMessageType(
    message: Record<string, unknown>,
  ): WhatsAppMessageType {
    const type = this.stringValue(message.type)?.toLowerCase();
    if (typeof message.body === 'string' && message.body.trim()) {
      return WhatsAppMessageType.TEXT;
    }
    switch (type) {
      case 'image':
        return WhatsAppMessageType.IMAGE;
      case 'document':
        return WhatsAppMessageType.DOCUMENT;
      case 'audio':
        return WhatsAppMessageType.AUDIO;
      case 'video':
        return WhatsAppMessageType.VIDEO;
      case 'sticker':
        return WhatsAppMessageType.STICKER;
      case 'location':
        return WhatsAppMessageType.LOCATION;
      case 'vcard':
      case 'contacts':
        return WhatsAppMessageType.CONTACTS;
      default:
        return WhatsAppMessageType.UNKNOWN;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : null;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private numberValue(value: unknown): number | null {
    const number =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^-?\d+$/.test(value)
          ? Number(value)
          : NaN;
    return Number.isInteger(number) ? number : null;
  }

  private ackEventId(
    providerMessageId: string,
    ack: number,
    providerTimestamp: Date | null,
  ): string {
    return createHash('sha256')
      .update(
        `${providerMessageId}\u0000${ack}\u0000${providerTimestamp?.getTime() ?? ''}`,
        'utf8',
      )
      .digest('hex');
  }

  private isUniqueError(error: unknown): boolean {
    return (
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002') ||
      this.asRecord(error)?.code === 'P2002'
    );
  }
}
