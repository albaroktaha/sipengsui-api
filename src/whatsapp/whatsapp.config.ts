import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WhatsAppMessageKey } from './whatsapp.types';
import { normalizeWahaGroupChatId } from './whatsapp-security';

@Injectable()
export class WhatsAppConfig {
  readonly enabled: boolean;
  readonly provider: string;
  readonly wahaBaseUrl: string;
  readonly wahaApiKey: string;
  readonly wahaSession: string;
  readonly wahaWebhookHmacKey: string;
  readonly wahaWebhookCustomSecret: string;
  readonly webhookAuthMode:
    'HMAC_SHA512' | 'CUSTOM_SECRET_NOT_PRODUCTION_READY';
  readonly wahaExpectedEngine: string;
  readonly defaultCountryCode: string;
  readonly defaultLanguage: string;
  readonly webhookMaxBodyBytes: number;
  readonly webhookMaxClockSkewSeconds: number;
  readonly sessionHealthCacheMs: number;
  readonly sendMinIntervalMs: number;
  readonly outboxBatchSize: number;
  readonly dispatchLockTtlMs: number;
  readonly maxAttempts: number;
  readonly inboxMaxAttempts: number;
  readonly inboxRetryBaseMs: number;
  readonly connectTimeoutMs: number;
  readonly responseTimeoutMs: number;
  readonly retentionDays: number;
  readonly pairingTtlMinutes: number;
  readonly pairingMaxAttempts: number;
  readonly pairingRateLimit: number;
  readonly pairingRateWindowMinutes: number;
  readonly conversationStateTtlMinutes: number;
  readonly serviceWindowHours: number;
  readonly aiRateLimit: number;
  readonly aiRateWindowMinutes: number;
  readonly statusRateLimit: number;
  readonly statusRateWindowMinutes: number;
  readonly consentTextVersion: string;
  readonly appUrl: string;
  readonly exposeRemindersEnabled: boolean;
  readonly exposeReminderOffsetsMinutes: number[];
  readonly exposeGroupChatId: string | null;

  private readonly messageVersions: Record<WhatsAppMessageKey, string>;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.parseBoolean(
      config.get<string>('WHATSAPP_ENABLED'),
      false,
    );
    this.provider =
      config.get<string>('WHATSAPP_PROVIDER')?.trim().toLowerCase() || 'waha';
    this.wahaBaseUrl = this.normalizeBaseUrl(
      config.get<string>('WAHA_BASE_URL')?.trim() ?? '',
    );
    this.wahaApiKey = config.get<string>('WAHA_API_KEY')?.trim() ?? '';
    this.wahaSession = config.get<string>('WAHA_SESSION')?.trim() || 'default';
    this.wahaWebhookHmacKey =
      config.get<string>('WAHA_WEBHOOK_HMAC_KEY')?.trim() ?? '';
    this.wahaWebhookCustomSecret =
      config.get<string>('WAHA_WEBHOOK_CUSTOM_SECRET')?.trim() ?? '';
    this.webhookAuthMode = this.wahaWebhookHmacKey
      ? 'HMAC_SHA512'
      : 'CUSTOM_SECRET_NOT_PRODUCTION_READY';
    this.wahaExpectedEngine =
      config.get<string>('WAHA_EXPECTED_ENGINE')?.trim().toUpperCase() ?? '';
    this.defaultCountryCode = this.parseCountryCode(
      config.get<string>('WHATSAPP_DEFAULT_COUNTRY_CODE'),
    );
    this.defaultLanguage =
      config.get<string>('WHATSAPP_DEFAULT_LANGUAGE')?.trim() || 'id';
    this.webhookMaxBodyBytes = this.parsePositiveInt(
      config.get<string>('WHATSAPP_WEBHOOK_MAX_BODY_BYTES'),
      262_144,
    );
    this.webhookMaxClockSkewSeconds = this.parsePositiveInt(
      config.get<string>('WAHA_WEBHOOK_MAX_CLOCK_SKEW_SECONDS'),
      300,
    );
    this.sessionHealthCacheMs = this.parsePositiveInt(
      config.get<string>('WAHA_SESSION_HEALTH_CACHE_MS'),
      10_000,
    );
    this.sendMinIntervalMs = this.parsePositiveInt(
      config.get<string>('WAHA_SEND_MIN_INTERVAL_MS'),
      1_500,
    );
    this.outboxBatchSize = this.parsePositiveInt(
      config.get<string>('WHATSAPP_OUTBOX_BATCH_SIZE'),
      25,
    );
    this.dispatchLockTtlMs = this.parsePositiveInt(
      config.get<string>('WHATSAPP_DISPATCH_LOCK_TTL_MS'),
      120_000,
    );
    this.maxAttempts = this.parsePositiveInt(
      config.get<string>('WHATSAPP_MAX_ATTEMPTS'),
      6,
    );
    this.inboxMaxAttempts = this.parsePositiveInt(
      config.get<string>('WHATSAPP_INBOX_MAX_ATTEMPTS'),
      this.maxAttempts,
    );
    this.inboxRetryBaseMs = this.parsePositiveInt(
      config.get<string>('WHATSAPP_INBOX_RETRY_BASE_MS'),
      15_000,
    );
    this.connectTimeoutMs = this.parsePositiveInt(
      config.get<string>('WHATSAPP_CONNECT_TIMEOUT_MS'),
      5_000,
    );
    this.responseTimeoutMs = this.parsePositiveInt(
      config.get<string>('WHATSAPP_RESPONSE_TIMEOUT_MS'),
      10_000,
    );
    this.retentionDays = this.parsePositiveInt(
      config.get<string>('WHATSAPP_RETENTION_DAYS'),
      90,
    );
    this.pairingTtlMinutes = this.parsePositiveInt(
      config.get<string>('WHATSAPP_PAIRING_TTL_MINUTES'),
      10,
    );
    this.pairingMaxAttempts = this.parsePositiveInt(
      config.get<string>('WHATSAPP_PAIRING_MAX_ATTEMPTS'),
      5,
    );
    this.pairingRateLimit = this.parsePositiveInt(
      config.get<string>('WHATSAPP_PAIRING_RATE_LIMIT'),
      10,
    );
    this.pairingRateWindowMinutes = this.parsePositiveInt(
      config.get<string>('WHATSAPP_PAIRING_RATE_WINDOW_MINUTES'),
      15,
    );
    this.conversationStateTtlMinutes = this.parsePositiveInt(
      config.get<string>('WHATSAPP_CONVERSATION_STATE_TTL_MINUTES'),
      30,
    );
    this.serviceWindowHours = this.parsePositiveInt(
      config.get<string>('WHATSAPP_SERVICE_WINDOW_HOURS'),
      24,
    );
    this.aiRateLimit = this.parsePositiveInt(
      config.get<string>('WHATSAPP_AI_RATE_LIMIT'),
      10,
    );
    this.aiRateWindowMinutes = this.parsePositiveInt(
      config.get<string>('WHATSAPP_AI_RATE_WINDOW_MINUTES'),
      1,
    );
    this.statusRateLimit = this.parsePositiveInt(
      config.get<string>('WHATSAPP_STATUS_RATE_LIMIT'),
      10,
    );
    this.statusRateWindowMinutes = this.parsePositiveInt(
      config.get<string>('WHATSAPP_STATUS_RATE_WINDOW_MINUTES'),
      1,
    );
    this.consentTextVersion =
      config.get<string>('WHATSAPP_CONSENT_TEXT_VERSION')?.trim() || 'v1';
    this.appUrl = (
      config.get<string>('APP_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
    this.exposeRemindersEnabled = this.parseBoolean(
      config.get<string>('WHATSAPP_EXPOSE_REMINDERS_ENABLED'),
      false,
    );
    this.exposeReminderOffsetsMinutes = this.parseOffsets(
      config.get<string>('WHATSAPP_EXPOSE_REMINDER_OFFSETS_MINUTES'),
    );
    const exposeGroupChatId = config
      .get<string>('WHATSAPP_EXPOSE_GROUP_ID')
      ?.trim();
    this.exposeGroupChatId = exposeGroupChatId
      ? normalizeWahaGroupChatId(exposeGroupChatId)
      : null;

    this.messageVersions = {
      STAGE_CHANGED: this.readVersion('WHATSAPP_MESSAGE_STAGE_CHANGED_VERSION'),
      CORRECTION_REQUIRED: this.readVersion(
        'WHATSAPP_MESSAGE_CORRECTION_REQUIRED_VERSION',
      ),
      EXPOSE_INVITATION: this.readVersion(
        'WHATSAPP_MESSAGE_EXPOSE_SCHEDULED_VERSION',
      ),
      EXPOSE_RESCHEDULED: this.readVersion(
        'WHATSAPP_MESSAGE_EXPOSE_RESCHEDULED_VERSION',
      ),
      EXPOSE_CANCELLED: this.readVersion(
        'WHATSAPP_MESSAGE_EXPOSE_CANCELLED_VERSION',
      ),
      EXPOSE_REMINDER: this.readVersion(
        'WHATSAPP_MESSAGE_EXPOSE_REMINDER_VERSION',
      ),
      REJECTED: this.readVersion('WHATSAPP_MESSAGE_REJECTED_VERSION'),
      PUBLISHED: this.readVersion('WHATSAPP_MESSAGE_PUBLISHED_VERSION'),
      CONVERSATION_REPLY: this.readVersion(
        'WHATSAPP_MESSAGE_CONVERSATION_REPLY_VERSION',
      ),
    };

    if (this.enabled) {
      const missing = [
        ['WAHA_BASE_URL', this.wahaBaseUrl],
        ['WAHA_API_KEY', this.wahaApiKey],
        ['WAHA_SESSION', this.wahaSession],
        ['WAHA_EXPECTED_ENGINE', this.wahaExpectedEngine],
        [
          'WAHA_WEBHOOK_HMAC_KEY or WAHA_WEBHOOK_CUSTOM_SECRET',
          this.wahaWebhookHmacKey || this.wahaWebhookCustomSecret,
        ],
      ]
        .filter(([, value]) => !value)
        .map(([name]) => name);
      if (this.provider !== 'waha') missing.push('WHATSAPP_PROVIDER=waha');
      if (process.env.NODE_ENV === 'production' && !this.wahaWebhookHmacKey) {
        missing.push('WAHA_WEBHOOK_HMAC_KEY untuk production');
      }
      if (missing.length > 0) {
        throw new Error(
          `WhatsApp WAHA diaktifkan tetapi konfigurasi wajib belum lengkap: ${missing.join(', ')}`,
        );
      }
    }
  }

  messageVersion(key: WhatsAppMessageKey): string {
    return this.messageVersions[key];
  }

  private readVersion(key: string): string {
    return this.config.get<string>(key)?.trim() || 'v1';
  }

  private normalizeBaseUrl(value: string): string {
    if (!value) return '';
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('WAHA_BASE_URL harus berupa URL yang valid');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(
        'WAHA_BASE_URL harus berupa URL HTTP(S) tanpa user/password',
      );
    }
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('WAHA_BASE_URL wajib menggunakan HTTPS pada production');
    }
    return value.replace(/\/+$/, '');
  }

  private parsePositiveInt(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    return value.trim().toLowerCase() === 'true';
  }

  private parseCountryCode(value: string | undefined): string {
    const normalized = value?.replace(/\D/g, '') || '62';
    return normalized.slice(0, 3) || '62';
  }

  private parseOffsets(value: string | undefined): number[] {
    const raw = value?.split(',') ?? ['1440', '60'];
    const parsed = [
      ...new Set(
        raw
          .map((item) => Number.parseInt(item.trim(), 10))
          .filter((item) => Number.isInteger(item) && item > 0),
      ),
    ].sort((a, b) => b - a);
    return parsed.length > 0 ? parsed : [1_440, 60];
  }
}
