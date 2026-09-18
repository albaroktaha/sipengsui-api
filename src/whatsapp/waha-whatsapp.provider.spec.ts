/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WahaWhatsAppProvider } from './waha-whatsapp.provider';
import { WhatsAppProviderError } from './whatsapp.types';

function config(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    wahaBaseUrl: 'https://waha.example.test',
    wahaApiKey: 'test-api-key',
    wahaSession: 'default',
    wahaExpectedEngine: 'WEBJS',
    connectTimeoutMs: 1_000,
    responseTimeoutMs: 1_000,
    sessionHealthCacheMs: 10_000,
    sendMinIntervalMs: 0,
    ...overrides,
  };
}

function response(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('WahaWhatsAppProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends rendered text to WAHA with a direct-chat id and API key', async () => {
    const fetchMock = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(response({ id: 'waha-message-1' }));
    globalThis.fetch = fetchMock;
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(
      provider.sendText({
        to: '+6281234567890',
        text: 'Halo dari SIPENGSUI',
      }),
    ).resolves.toEqual({ providerMessageId: 'waha-message-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.example.test/api/sendText',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Api-Key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          session: 'default',
          chatId: '6281234567890@c.us',
          text: 'Halo dari SIPENGSUI',
          linkPreview: false,
        }),
      }),
    );
  });

  it('sends rendered text to a configured group chat id', async () => {
    const fetchMock = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(response({ id: 'waha-group-message-1' }));
    globalThis.fetch = fetchMock;
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(
      provider.sendText({
        to: '123456789012@g.us',
        recipientType: 'GROUP',
        text: 'Undangan Ekspose',
      } as never),
    ).resolves.toEqual({ providerMessageId: 'waha-group-message-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.example.test/api/sendText',
      expect.objectContaining({
        body: JSON.stringify({
          session: 'default',
          chatId: '123456789012@g.us',
          text: 'Undangan Ekspose',
          linkPreview: false,
        }),
      }),
    );
  });

  it('resolves an @lid phone using the WAHA LIDs endpoint', async () => {
    const fetchMock = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      response({
        lid: '177433789616307@lid',
        pn: '6281234567890@c.us',
      }),
    );
    globalThis.fetch = fetchMock;
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(provider.resolveLidPhone('177433789616307@lid')).resolves.toBe(
      '+6281234567890',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.example.test/api/default/lids/177433789616307%40lid',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects a malformed LID before calling WAHA', async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = fetchMock;
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(provider.resolveLidPhone('not-a-lid')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when WAHA accepts a request without a message id', async () => {
    globalThis.fetch = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(response({ success: true }));
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(
      provider.sendText({ to: '+6281234567890', text: 'Halo' }),
    ).rejects.toMatchObject({
      kind: 'PERMANENT',
      code: 'PROVIDER_INVALID_RESPONSE',
    });
  });

  it('accepts an engine response whose message id is nested under key', async () => {
    globalThis.fetch = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(response({ key: { id: 'noweb-message-1' } }));
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(
      provider.sendText({ to: '+6281234567890', text: 'Halo' }),
    ).resolves.toEqual({ providerMessageId: 'noweb-message-1' });
  });

  it('rejects invalid recipients and empty bodies without calling WAHA', async () => {
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = fetchMock;
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(
      provider.sendText({ to: 'not-a-phone', text: 'Halo' }),
    ).rejects.toMatchObject({
      kind: 'PERMANENT',
      code: 'INVALID_RECIPIENT',
    });
    await expect(
      provider.sendText({ to: '+6281234567890', text: '   ' }),
    ).rejects.toMatchObject({
      kind: 'PERMANENT',
      code: 'MESSAGE_BODY_EMPTY',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classifies rate limiting and preserves Retry-After', async () => {
    globalThis.fetch = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      response(
        { error: 'busy' },
        { status: 429, headers: { 'Retry-After': '3' } },
      ),
    );
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(
      provider.sendText({ to: '+6281234567890', text: 'Halo' }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WhatsAppProviderError>>({
        kind: 'TRANSIENT',
        code: 'HTTP_429',
        retryAfterMs: 3_000,
      }),
    );
  });

  it('classifies an ambiguous send network failure as UNKNOWN', async () => {
    globalThis.fetch = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockRejectedValue(new Error('connection reset'));
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(
      provider.sendText({ to: '+6281234567890', text: 'Halo' }),
    ).rejects.toMatchObject({
      kind: 'UNKNOWN',
      code: 'PROVIDER_NETWORK_ERROR',
    });
  });

  it('reads and caches a working session health response', async () => {
    const fetchMock = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockImplementation(async (input) => {
      await Promise.resolve();
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith('/timelock')) return response({ isActive: false });
      if (url.endsWith('/capping')) return response({ cappingStatus: 'NONE' });
      return response({
        name: 'default',
        status: 'WORKING',
        engine: { engine: 'WEBJS' },
        me: { reachoutTimelock: null, messageCapping: null },
      });
    });
    globalThis.fetch = fetchMock;
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(provider.getSessionHealth()).resolves.toMatchObject({
      session: 'default',
      status: 'WORKING',
      engine: 'WEBJS',
      isWorking: true,
      reachoutTimelockActive: false,
      messageCappingStatus: 'NONE',
    });
    await provider.getSessionHealth();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.example.test/api/sessions/default',
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-Api-Key': 'test-api-key', Accept: 'application/json' },
      }),
    );
  });

  it('reports a failed session without probing restriction endpoints', async () => {
    const fetchMock = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockResolvedValue(
      response({
        name: 'default',
        status: 'FAILED',
        engine: 'WEBJS',
      }),
    );
    globalThis.fetch = fetchMock;
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(provider.getSessionHealth()).resolves.toMatchObject({
      session: 'default',
      status: 'FAILED',
      engine: 'WEBJS',
      isWorking: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://waha.example.test/api/sessions/default',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('holds sending when observed session status has a reachout timelock', async () => {
    const provider = new WahaWhatsAppProvider(config() as never);
    provider.observeSessionStatus({
      session: 'default',
      engine: 'WEBJS',
      status: 'WORKING',
      data: {
        reachoutTimelock: {
          isActive: true,
          timeEnforcementEnds: Math.floor(Date.now() / 1_000) + 60,
        },
      },
    });

    await expect(provider.getSessionHealth()).resolves.toMatchObject({
      status: 'WORKING',
      isWorking: false,
      reachoutTimelockActive: true,
    });
  });

  it('uses fresh timelock and capping endpoints instead of trusting stale session info', async () => {
    const fetchMock = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockImplementation(async (input) => {
      await Promise.resolve();
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith('/timelock')) return response({ isActive: true });
      if (url.endsWith('/capping'))
        return response({ cappingStatus: 'CAPPED' });
      return response({
        name: 'default',
        status: 'WORKING',
        engine: 'WEBJS',
      });
    });
    globalThis.fetch = fetchMock;
    const provider = new WahaWhatsAppProvider(config() as never);

    await expect(provider.getSessionHealth()).resolves.toMatchObject({
      status: 'WORKING',
      isWorking: false,
      reachoutTimelockActive: true,
      messageCappingStatus: 'CAPPED',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ignores an older session.status event after a newer state', async () => {
    const provider = new WahaWhatsAppProvider(config() as never);
    provider.observeSessionStatus({
      session: 'default',
      engine: 'WEBJS',
      status: 'STOPPED',
      timestamp: new Date(2_000),
    });
    provider.observeSessionStatus({
      session: 'default',
      engine: 'WEBJS',
      status: 'WORKING',
      timestamp: new Date(1_000),
    });

    await expect(provider.getSessionHealth()).resolves.toMatchObject({
      status: 'STOPPED',
      isWorking: false,
    });
  });

  it('reuses a previously verified engine when SessionInfo omits it', async () => {
    const provider = new WahaWhatsAppProvider(
      config({ sessionHealthCacheMs: 0 }) as never,
    );
    provider.observeSessionStatus({
      session: 'default',
      engine: 'WEBJS',
      status: 'WORKING',
      timestamp: new Date(Date.now()),
    });
    globalThis.fetch = (
      jest.fn() as jest.MockedFunction<typeof fetch>
    ).mockImplementation(async (input) => {
      await Promise.resolve();
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith('/timelock')) return response({ isActive: false });
      if (url.endsWith('/capping')) return response({ cappingStatus: 'NONE' });
      return response({ name: 'default', status: 'WORKING' });
    });

    await expect(provider.getSessionHealth()).resolves.toMatchObject({
      engine: 'WEBJS',
      isWorking: true,
    });
  });
});
