/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { WhatsAppConfig } from './whatsapp.config';
import { WahaWhatsAppProvider } from './waha-whatsapp.provider';
import { WhatsAppProviderError } from './whatsapp.types';
import {
  hashPairingCode,
  normalizePairingCode,
  normalizeWahaChatId,
  normalizeWhatsAppPhone,
  phoneFromWahaChatId,
  verifyWahaSignature,
} from './whatsapp-security';
import { WhatsAppMessageRegistry } from './whatsapp-message.registry';

function configFrom(values: Record<string, string>): WhatsAppConfig {
  return new WhatsAppConfig({
    get: <T>(key: string) => values[key] as T | undefined,
  } as ConfigService);
}

describe('WhatsApp security primitives', () => {
  it('normalizes Indonesian local and international numbers to E.164', () => {
    expect(normalizeWhatsAppPhone('0812 3456 7890')).toBe('+6281234567890');
    expect(normalizeWhatsAppPhone('+62 (812) 3456-7890')).toBe(
      '+6281234567890',
    );
    expect(normalizeWhatsAppPhone('006281234567890')).toBe('+6281234567890');
  });

  it('accepts provider country-code digits when explicitly allowed', () => {
    expect(
      normalizeWhatsAppPhone('14155551234', '62', {
        allowBareInternational: true,
      }),
    ).toBe('+14155551234');
  });

  it('rejects ambiguous and malformed phone input', () => {
    expect(() => normalizeWhatsAppPhone('81234567890')).toThrow();
    expect(() => normalizeWhatsAppPhone('+62ABC')).toThrow();
    expect(() => normalizeWhatsAppPhone('0812')).toThrow();
  });

  it('verifies the exact raw body SHA-512 signature and rejects tampering', () => {
    const raw = Buffer.from('{"event":"message","session":"default"}');
    const secret = 'test-webhook-key';
    const signature = createHmac('sha512', secret).update(raw).digest('hex');
    expect(verifyWahaSignature(raw, signature, 'sha512', secret)).toBe(true);
    expect(
      verifyWahaSignature(
        Buffer.from(`${raw.toString()} `),
        signature,
        'sha512',
        secret,
      ),
    ).toBe(false);
    expect(verifyWahaSignature(raw, signature, 'sha256', secret)).toBe(false);
    expect(verifyWahaSignature(raw, 'bad', 'sha512', secret)).toBe(false);
  });

  it('normalizes and validates WAHA direct chat ids only', () => {
    expect(normalizeWahaChatId('+6281234567890')).toBe('6281234567890@c.us');
    expect(phoneFromWahaChatId('6281234567890@c.us')).toBe('+6281234567890');
    expect(phoneFromWahaChatId('123@g.us')).toBeNull();
    expect(phoneFromWahaChatId('status@broadcast')).toBeNull();
  });

  it('hashes pairing codes after case normalization', () => {
    expect(normalizePairingCode('  AbC-123  ')).toBe('ABC-123');
    expect(hashPairingCode('AbC-123')).toBe(hashPairingCode('abc-123'));
    expect(hashPairingCode('AbC-123')).not.toContain('AbC-123');
  });
});

describe('WhatsApp configuration and message registry', () => {
  it('keeps the WAHA provider disabled by default', () => {
    const config = configFrom({});
    expect(config.enabled).toBe(false);
    expect(config.provider).toBe('waha');
    expect(config.defaultCountryCode).toBe('62');
    expect(config.messageVersion('STAGE_CHANGED')).toBe('v1');
  });

  it('fails fast when enabled WAHA configuration is incomplete', () => {
    expect(() => configFrom({ WHATSAPP_ENABLED: 'true' })).toThrow(
      'WhatsApp WAHA diaktifkan',
    );
  });

  it('marks custom webhook secret fallback as not production ready', () => {
    const config = configFrom({
      WHATSAPP_ENABLED: 'true',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_API_KEY: 'api-key',
      WAHA_SESSION: 'default',
      WAHA_EXPECTED_ENGINE: 'WEBJS',
      WAHA_WEBHOOK_CUSTOM_SECRET: 'custom-secret',
    });
    expect(config.webhookAuthMode).toBe('CUSTOM_SECRET_NOT_PRODUCTION_READY');
  });

  it('requires HMAC webhook authentication in production', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() =>
        configFrom({
          WHATSAPP_ENABLED: 'true',
          WAHA_BASE_URL: 'https://waha.example.test',
          WAHA_API_KEY: 'api-key',
          WAHA_SESSION: 'default',
          WAHA_EXPECTED_ENGINE: 'WEBJS',
          WAHA_WEBHOOK_CUSTOM_SECRET: 'custom-secret',
        }),
      ).toThrow('WAHA_WEBHOOK_HMAC_KEY untuk production');
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('requires an expected WAHA engine when the channel is enabled', () => {
    expect(() =>
      configFrom({
        WHATSAPP_ENABLED: 'true',
        WAHA_BASE_URL: 'https://waha.example.test',
        WAHA_API_KEY: 'api-key',
        WAHA_SESSION: 'default',
        WAHA_WEBHOOK_HMAC_KEY: 'hmac-key',
      }),
    ).toThrow('WAHA_EXPECTED_ENGINE');
  });

  it('renders a versioned text message from domain context', () => {
    const config = configFrom({
      WHATSAPP_MESSAGE_STAGE_CHANGED_VERSION: 'v3',
    });
    const registry = new WhatsAppMessageRegistry(config);
    expect(
      registry.resolve('STAGE_CHANGED', {
        applicationNumber: 'REK-20260901-001',
        stageLabel: 'Evaluasi Dokumen Awal',
        nextAction: 'Pokja mengevaluasi berkas',
        applicationUrl: 'https://example.test/dashboard/rekomtek/id',
      }),
    ).toEqual({
      messageKey: 'STAGE_CHANGED',
      messageVersion: 'v3',
      language: 'id',
      text: expect.stringContaining('REK-20260901-001'),
    });
  });
});

describe('WahaWhatsAppProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function enabledConfig() {
    return configFrom({
      WHATSAPP_ENABLED: 'true',
      WHATSAPP_PROVIDER: 'waha',
      WAHA_BASE_URL: 'https://waha.example.test',
      WAHA_API_KEY: 'test-api-key',
      WAHA_SESSION: 'default',
      WAHA_WEBHOOK_HMAC_KEY: 'test-webhook-key',
      WAHA_EXPECTED_ENGINE: 'WEBJS',
    });
  }

  it('sends rendered text through the WAHA endpoint', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ id: 'waha.sent' }),
    }) as typeof fetch;
    const provider = new WahaWhatsAppProvider(enabledConfig());

    await expect(
      provider.sendText({
        to: '+6281234567890',
        text: 'Pesan stage',
      }),
    ).resolves.toEqual({ providerMessageId: 'waha.sent' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://waha.example.test/api/sendText',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('classifies rate limits as transient and client errors as permanent', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '3' }),
      json: () => Promise.resolve({ error: { code: 130429 } }),
    }) as typeof fetch;
    const provider = new WahaWhatsAppProvider(enabledConfig());
    await expect(
      provider.sendText({ to: '+6281234567890', text: 'halo' }),
    ).rejects.toMatchObject<Partial<WhatsAppProviderError>>({
      kind: 'TRANSIENT',
      code: 'HTTP_429',
      retryAfterMs: 3_000,
    });

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: () => Promise.resolve({ error: { code: 100 } }),
    }) as typeof fetch;
    await expect(
      provider.sendText({ to: '+6281234567890', text: 'halo' }),
    ).rejects.toMatchObject<Partial<WhatsAppProviderError>>({
      kind: 'PERMANENT',
      code: '100',
    });
  });
});
