import { Injectable, Optional } from '@nestjs/common';
import { WhatsAppConfig } from './whatsapp.config';
import {
  normalizeWahaChatId,
  normalizeWahaGroupChatId,
  phoneFromWahaChatId,
} from './whatsapp-security';
import {
  WhatsAppProviderError,
  type WhatsAppProviderPort,
  type WhatsAppProviderSendResult,
  type WhatsAppSendTextInput,
  type WhatsAppSessionHealth,
  type WhatsAppSessionStatusObservation,
} from './whatsapp.types';
import { WhatsAppMetricsService } from './whatsapp-metrics.service';

@Injectable()
export class WahaWhatsAppProvider implements WhatsAppProviderPort {
  private cachedHealth: WhatsAppSessionHealth | null = null;
  private cachedHealthAt = 0;
  private lastSendAt = 0;
  private lastSessionStatusTimestamp = 0;
  private verifiedEngine: string | null = null;
  private pacingTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: WhatsAppConfig,
    @Optional() private readonly metrics?: WhatsAppMetricsService,
  ) {}

  async sendText(
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppProviderSendResult> {
    this.assertEnabled();
    if (!input.text.trim()) {
      throw new WhatsAppProviderError(
        'Isi pesan WhatsApp kosong',
        'PERMANENT',
        'MESSAGE_BODY_EMPTY',
      );
    }
    let chatId: string;
    try {
      chatId =
        input.recipientType === 'GROUP'
          ? normalizeWahaGroupChatId(input.to)
          : normalizeWahaChatId(input.to, this.config.defaultCountryCode);
    } catch {
      throw new WhatsAppProviderError(
        'Nomor penerima WhatsApp tidak valid',
        'PERMANENT',
        'INVALID_RECIPIENT',
      );
    }
    await this.waitForPacing();
    try {
      const response = await this.request(
        '/api/sendText',
        'POST',
        {
          session: this.config.wahaSession,
          chatId,
          text: input.text.trim().slice(0, 4_000),
          linkPreview: false,
        },
        { ambiguousOnFailure: true },
      );
      const providerMessageId = this.messageId(response);
      if (!providerMessageId) {
        throw new WhatsAppProviderError(
          'Respons WAHA tidak memiliki message ID',
          'PERMANENT',
          'PROVIDER_INVALID_RESPONSE',
        );
      }
      this.metrics?.increment('outbox_send_success');
      return { providerMessageId };
    } catch (error) {
      this.metrics?.increment('outbox_send_failure');
      throw error;
    }
  }

  async resolveLidPhone(lid: string): Promise<string | null> {
    this.assertEnabled();
    const normalized = lid.trim();
    if (!normalized.endsWith('@lid')) return null;
    const payload = await this.request(
      `/api/${encodeURIComponent(this.config.wahaSession)}/lids/${encodeURIComponent(normalized)}`,
      'GET',
    );
    const root = this.asRecord(payload) ?? {};
    const data = this.asRecord(root.data);
    const candidates = [
      root.pn,
      root.phoneNumber,
      root.phone,
      root.jid,
      data?.pn,
      data?.phoneNumber,
      data?.phone,
      data?.jid,
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const phoneE164 = phoneFromWahaChatId(
        candidate,
        this.config.defaultCountryCode,
      );
      if (phoneE164) return phoneE164;
    }
    return null;
  }

  async getSessionHealth(): Promise<WhatsAppSessionHealth> {
    this.assertEnabled();
    const now = Date.now();
    if (
      this.cachedHealth &&
      now - this.cachedHealthAt < this.config.sessionHealthCacheMs
    ) {
      return this.cachedHealth;
    }
    try {
      const sessionPayload = await this.request(
        `/api/sessions/${encodeURIComponent(this.config.wahaSession)}`,
        'GET',
      );
      const sessionOnlyHealth = this.parseHealth(sessionPayload, null, null);
      if (sessionOnlyHealth.status !== 'WORKING') {
        this.cachedHealth = sessionOnlyHealth;
        this.cachedHealthAt = now;
        return sessionOnlyHealth;
      }

      const [timelockPayload, cappingPayload] = await Promise.all([
        this.request(
          `/api/sessions/${encodeURIComponent(this.config.wahaSession)}/timelock`,
          'GET',
        ),
        this.request(
          `/api/sessions/${encodeURIComponent(this.config.wahaSession)}/capping`,
          'GET',
        ),
      ]);
      const health = this.parseHealth(
        sessionPayload,
        timelockPayload,
        cappingPayload,
      );
      this.cachedHealth = health;
      this.cachedHealthAt = now;
      return health;
    } catch (error) {
      this.metrics?.increment('provider_health_error');
      throw error;
    }
  }

  observeSessionStatus(input: WhatsAppSessionStatusObservation): void {
    if (input.session !== this.config.wahaSession) return;
    const timestamp = input.timestamp?.getTime();
    if (
      timestamp !== undefined &&
      Number.isFinite(timestamp) &&
      timestamp <= this.lastSessionStatusTimestamp
    ) {
      return;
    }
    if (timestamp !== undefined && Number.isFinite(timestamp)) {
      this.lastSessionStatusTimestamp = timestamp;
    }
    const previousStatus = this.cachedHealth?.status;
    const engine = input.engine?.trim().toUpperCase() || null;
    if (engine === this.config.wahaExpectedEngine) {
      this.verifiedEngine = engine;
    }
    const data = this.asRecord(input.data);
    const reachout = this.asRecord(data?.reachoutTimelock);
    const capping = this.asRecord(data?.messageCapping);
    const reachoutTimelockActive = reachout?.isActive === true;
    const messageCappingStatus =
      this.stringValue(capping?.cappingStatus) ?? null;
    const engineMatches =
      Boolean(this.config.wahaExpectedEngine) &&
      engine === this.config.wahaExpectedEngine;
    this.cachedHealth = {
      session: input.session,
      status: input.status,
      engine,
      isWorking:
        input.status === 'WORKING' &&
        engineMatches &&
        !reachoutTimelockActive &&
        messageCappingStatus !== 'CAPPED',
      reachoutTimelockActive,
      messageCappingStatus,
      observedAt: input.timestamp ?? new Date(),
    };
    this.cachedHealthAt = Date.now();
    this.metrics?.increment('session_status');
    if (
      previousStatus &&
      previousStatus !== 'WORKING' &&
      input.status === 'WORKING'
    ) {
      this.metrics?.increment('session_reconnect');
    }
    if (['FAILED', 'STOPPED', 'SCAN_QR_CODE'].includes(input.status)) {
      this.metrics?.increment('session_disconnect');
    }
    if (reachoutTimelockActive) this.metrics?.increment('session_timelock');
    if (messageCappingStatus === 'CAPPED') {
      this.metrics?.increment('session_capping');
    }
  }

  private async request(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
    options: { ambiguousOnFailure?: boolean } = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(this.config.connectTimeoutMs, this.config.responseTimeoutMs),
    );
    try {
      const response = await fetch(`${this.config.wahaBaseUrl}${path}`, {
        method,
        headers: {
          'X-Api-Key': this.config.wahaApiKey,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const payload = await this.readJson(response);
      if (!response.ok) {
        const code =
          response.status === 429
            ? 'HTTP_429'
            : (this.errorCode(payload) ?? `HTTP_${response.status}`);
        const retryAfterMs = this.retryAfterMs(
          response.headers.get('retry-after'),
        );
        throw new WhatsAppProviderError(
          'WAHA menolak permintaan WhatsApp',
          response.status === 429
            ? 'TRANSIENT'
            : response.status >= 500
              ? options.ambiguousOnFailure
                ? 'UNKNOWN'
                : 'TRANSIENT'
              : 'PERMANENT',
          code,
          retryAfterMs,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof WhatsAppProviderError) throw error;
      const code =
        error instanceof Error && error.name === 'AbortError'
          ? 'PROVIDER_TIMEOUT'
          : 'PROVIDER_NETWORK_ERROR';
      throw new WhatsAppProviderError(
        'WAHA tidak dapat dihubungi',
        options.ambiguousOnFailure ? 'UNKNOWN' : 'TRANSIENT',
        code,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseHealth(
    payload: unknown,
    timelockPayload: unknown,
    cappingPayload: unknown,
  ): WhatsAppSessionHealth {
    const root = this.asRecord(payload) ?? {};
    const nestedPayload = this.asRecord(root.payload);
    const status =
      this.stringValue(nestedPayload?.status) ??
      this.stringValue(root.status) ??
      'UNKNOWN';
    const reportedEngine = this.readEngine(root, nestedPayload);
    const engine = reportedEngine ?? this.verifiedEngine;
    const data = this.asRecord(nestedPayload?.data) ?? this.asRecord(root.data);
    const me = this.asRecord(root.me);
    const fallbackReachout =
      this.asRecord(data?.reachoutTimelock) ??
      this.asRecord(me?.reachoutTimelock);
    const fallbackCapping =
      this.asRecord(data?.messageCapping) ?? this.asRecord(me?.messageCapping);
    const freshReachout = this.asRecord(timelockPayload);
    const freshCapping = this.asRecord(cappingPayload);
    const reachout = freshReachout ?? fallbackReachout;
    const capping = freshCapping ?? fallbackCapping;
    const reachoutTimelockActive = freshReachout
      ? reachout?.isActive !== false
      : reachout?.isActive === true;
    const messageCappingStatus =
      this.stringValue(capping?.cappingStatus) ??
      (freshCapping ? 'UNKNOWN' : null);
    const restrictionUnknown =
      !freshReachout || !freshCapping
        ? !fallbackReachout || !fallbackCapping
        : false;
    const engineMatches =
      Boolean(this.config.wahaExpectedEngine) &&
      engine === this.config.wahaExpectedEngine;
    return {
      session: this.config.wahaSession,
      status,
      engine,
      isWorking:
        status === 'WORKING' &&
        engineMatches &&
        !reachoutTimelockActive &&
        !restrictionUnknown &&
        messageCappingStatus !== 'CAPPED' &&
        messageCappingStatus !== 'UNKNOWN',
      reachoutTimelockActive,
      messageCappingStatus,
      observedAt: new Date(),
    };
  }

  private readEngine(
    root: Record<string, unknown>,
    nestedPayload: Record<string, unknown> | null,
  ): string | null {
    const candidates = [root.engine, nestedPayload?.engine];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim().toUpperCase();
      }
      const record = this.asRecord(candidate);
      const name = this.stringValue(record?.engine);
      if (name) return name.toUpperCase();
    }
    return null;
  }

  private messageId(payload: unknown): string | null {
    const record = this.asRecord(payload);
    const rootId = this.stringValue(record?.id);
    if (rootId) return rootId;
    const key = this.asRecord(record?.key);
    const keyId = this.stringValue(key?.id);
    if (keyId) return keyId;
    const nestedMessage = this.asRecord(record?.message);
    const nestedId = this.stringValue(nestedMessage?.id);
    if (nestedId) return nestedId;
    const data = this.asRecord(record?.data);
    return this.stringValue(data?.id) ?? null;
  }

  private errorCode(payload: unknown): string | null {
    const record = this.asRecord(payload);
    const error = this.asRecord(record?.error);
    return (
      this.stringOrNumber(error?.code) ??
      this.stringOrNumber(record?.code) ??
      null
    );
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private retryAfterMs(value: string | null): number | undefined {
    if (!value) return undefined;
    if (/^\d+$/.test(value)) {
      const seconds = Number(value);
      return Number.isSafeInteger(seconds) ? seconds * 1_000 : undefined;
    }
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp)
      ? undefined
      : Math.max(0, timestamp - Date.now());
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new WhatsAppProviderError(
        'WhatsApp sedang dinonaktifkan',
        'PERMANENT',
        'WHATSAPP_DISABLED',
      );
    }
  }

  private async waitForPacing(): Promise<void> {
    let release!: () => void;
    const previous = this.pacingTail;
    this.pacingTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const delayMs = Math.max(
        0,
        this.lastSendAt + this.config.sendMinIntervalMs - Date.now(),
      );
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
      this.lastSendAt = Date.now();
    } finally {
      release();
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

  private stringOrNumber(value: unknown): string | undefined {
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
    return this.stringValue(value);
  }
}
