/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { createHmac } from 'node:crypto';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WhatsAppMessageType } from '@prisma/client';

function sign(rawBody: Buffer, secret: string): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

function config(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    wahaSession: 'default',
    wahaWebhookHmacKey: 'webhook-key',
    wahaExpectedEngine: 'WEBJS',
    webhookMaxBodyBytes: 100_000,
    webhookMaxClockSkewSeconds: 300,
    ...overrides,
  };
}

function envelope(event: string, payload: Record<string, unknown>) {
  return {
    timestamp: Date.now(),
    event,
    session: 'default',
    engine: 'WEBJS',
    payload,
  };
}

describe('WhatsAppWebhookService with WAHA events', () => {
  const now = Date.now();

  function makeService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      whatsAppInboundEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'inbound-1' }),
      },
    };
    const identities = {
      getOrCreateIdentity: jest.fn().mockResolvedValue({ id: 'identity-1' }),
    };
    const inbox = { process: jest.fn().mockResolvedValue(undefined) };
    const dispatcher = { recordDeliveryStatus: jest.fn() };
    const provider = { observeSessionStatus: jest.fn() };
    const service = new WhatsAppWebhookService(
      prisma as never,
      { ...config(), ...overrides } as never,
      identities as never,
      inbox as never,
      dispatcher as never,
      provider as never,
    );
    return { service, prisma, identities, inbox, dispatcher, provider };
  }

  it('accepts a signed direct inbound message and persists it idempotently', async () => {
    const { service, prisma, identities, inbox } = makeService();
    const payload = envelope('message', {
      id: 'false_6281234567890@c.us_message-1',
      timestamp: Math.floor(now / 1_000),
      from: '6281234567890@c.us',
      to: '6289999999999@c.us',
      fromMe: false,
      source: 'app',
      body: 'MENU',
      hasMedia: false,
    });
    const rawBody = Buffer.from(JSON.stringify(payload));

    await expect(
      service.accept({
        rawBody,
        signature: sign(rawBody, 'webhook-key'),
        algorithm: 'sha512',
        timestamp: String(now),
        requestId: 'request-1',
        contentType: 'application/json',
      }),
    ).resolves.toEqual({ status: 'accepted' });

    expect(identities.getOrCreateIdentity).toHaveBeenCalledWith(
      '+6281234567890',
      '6281234567890',
    );
    expect(prisma.whatsAppInboundEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerRequestId: 'request-1',
          eventName: 'message',
          providerEventId: expect.stringContaining('message-1'),
          providerMessageId: 'false_6281234567890@c.us_message-1',
          identityId: 'identity-1',
          messageType: WhatsAppMessageType.TEXT,
          textBody: 'MENU',
        }),
      }),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(inbox.process).toHaveBeenCalledWith('inbound-1');
  });

  it('rejects wrong algorithm, stale timestamp, and missing request id before persistence', async () => {
    const { service, prisma } = makeService();
    const rawBody = Buffer.from(JSON.stringify(envelope('message', {})));
    const base = {
      rawBody,
      signature: sign(rawBody, 'webhook-key'),
      timestamp: String(now),
      requestId: 'request-1',
      contentType: 'application/json',
    };

    await expect(
      service.accept({ ...base, algorithm: 'sha256' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.accept({ ...base, algorithm: 'sha512', timestamp: '1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.accept({ ...base, algorithm: 'sha512', requestId: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.whatsAppInboundEvent.create).not.toHaveBeenCalled();
  });

  it('does not turn an identity database outage into an ignored event', async () => {
    const { service, prisma, identities } = makeService();
    identities.getOrCreateIdentity.mockRejectedValue(
      new Error('database unavailable'),
    );
    const payload = envelope('message', {
      id: 'false_6281234567890@c.us_message-db',
      timestamp: Math.floor(now / 1_000),
      from: '6281234567890@c.us',
      fromMe: false,
      source: 'app',
      body: 'MENU',
    });
    const rawBody = Buffer.from(JSON.stringify(payload));

    await expect(
      service.accept({
        rawBody,
        signature: sign(rawBody, 'webhook-key'),
        algorithm: 'sha512',
        timestamp: String(now),
        requestId: 'request-db-error',
        contentType: 'application/json',
      }),
    ).rejects.toThrow('database unavailable');
    expect(prisma.whatsAppInboundEvent.create).not.toHaveBeenCalled();
  });

  it('accepts the explicitly marked temporary custom-secret fallback', async () => {
    const { service, provider } = makeService({
      wahaWebhookHmacKey: '',
      wahaWebhookCustomSecret: 'temporary-secret',
    });
    const payload = envelope('session.status', {
      name: 'default',
      status: 'STOPPED',
      data: null,
    });
    const rawBody = Buffer.from(JSON.stringify(payload));

    await expect(
      service.accept({
        rawBody,
        customSecret: 'temporary-secret',
        timestamp: String(now),
        requestId: 'custom-secret-1',
        contentType: 'application/json',
      }),
    ).resolves.toEqual({ status: 'accepted' });
    expect(provider.observeSessionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'STOPPED' }),
    );
  });

  it('ignores replayed request ids, groups, fromMe, and API-origin messages', async () => {
    const { service, prisma, identities } = makeService();
    const replayPayload = envelope('message', {
      id: 'message-replay',
      from: '6281234567890@c.us',
      fromMe: false,
      source: 'app',
      body: 'MENU',
    });
    prisma.whatsAppInboundEvent.findUnique.mockResolvedValueOnce({
      id: 'already-seen',
    });
    const replayRaw = Buffer.from(JSON.stringify(replayPayload));
    await expect(
      service.accept({
        rawBody: replayRaw,
        signature: sign(replayRaw, 'webhook-key'),
        algorithm: 'sha512',
        timestamp: String(now),
        requestId: 'request-replay',
        contentType: 'application/json',
      }),
    ).resolves.toEqual({ status: 'ignored' });

    for (const payload of [
      envelope('message', {
        id: 'group-1',
        from: '123@g.us',
        fromMe: false,
        source: 'app',
        body: 'MENU',
      }),
      envelope('message', {
        id: 'self-1',
        from: '6281234567890@c.us',
        fromMe: true,
        source: 'app',
        body: 'MENU',
      }),
      envelope('message', {
        id: 'api-1',
        from: '6281234567890@c.us',
        fromMe: false,
        source: 'api',
        body: 'MENU',
      }),
    ]) {
      const body = Buffer.from(JSON.stringify(payload));
      await expect(
        service.accept({
          rawBody: body,
          signature: sign(body, 'webhook-key'),
          algorithm: 'sha512',
          timestamp: String(now),
          requestId: `request-${String(payload.payload?.id)}`,
          contentType: 'application/json',
        }),
      ).resolves.toEqual({ status: 'ignored' });
    }
    expect(identities.getOrCreateIdentity).not.toHaveBeenCalled();
  });

  it('maps message.ack integer values to delivery audit and observes session status', async () => {
    const { service, dispatcher, provider } = makeService();
    for (const [ack, ackName] of [
      [-1, 'ERROR'],
      [0, 'PENDING'],
      [1, 'SERVER'],
      [2, 'DEVICE'],
      [3, 'READ'],
      [4, 'PLAYED'],
    ] as const) {
      const payload = envelope('message.ack', {
        id: `outbound-${ack}`,
        from: '6281234567890@c.us',
        fromMe: true,
        ack,
        ackName,
      });
      const rawBody = Buffer.from(JSON.stringify(payload));
      await service.accept({
        rawBody,
        signature: sign(rawBody, 'webhook-key'),
        algorithm: 'sha512',
        timestamp: String(now),
        requestId: `ack-${ack}`,
        contentType: 'application/json',
      });
    }
    const statusPayload = envelope('session.status', {
      name: 'default',
      status: 'WORKING',
      data: { messageCapping: { cappingStatus: 'NONE' } },
    });
    const statusRaw = Buffer.from(JSON.stringify(statusPayload));
    await service.accept({
      rawBody: statusRaw,
      signature: sign(statusRaw, 'webhook-key'),
      algorithm: 'sha512',
      timestamp: String(now),
      requestId: 'session-status-1',
      contentType: 'application/json',
    });

    expect(dispatcher.recordDeliveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        providerMessageId: 'outbound-3',
        ack: 3,
        ackName: 'READ',
      }),
    );
    expect(provider.observeSessionStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        session: 'default',
        status: 'WORKING',
        engine: 'WEBJS',
      }),
    );
  });

  it('deduplicates the same ACK when WAHA redelivers it with a new request id', async () => {
    const { service, dispatcher } = makeService();
    const payload = envelope('message.ack', {
      id: 'outbound-redelivered',
      from: '6281234567890@c.us',
      fromMe: true,
      ack: 2,
      ackName: 'DEVICE',
      timestamp: Math.floor(now / 1_000),
    });
    const rawBody = Buffer.from(JSON.stringify(payload));

    await service.accept({
      rawBody,
      signature: sign(rawBody, 'webhook-key'),
      algorithm: 'sha512',
      timestamp: String(now),
      requestId: 'ack-redelivery-1',
      contentType: 'application/json',
    });
    await service.accept({
      rawBody,
      signature: sign(rawBody, 'webhook-key'),
      algorithm: 'sha512',
      timestamp: String(now),
      requestId: 'ack-redelivery-2',
      contentType: 'application/json',
    });

    expect(dispatcher.recordDeliveryStatus).toHaveBeenCalledTimes(2);
    expect(
      dispatcher.recordDeliveryStatus.mock.calls[0][0].providerEventId,
    ).toBe(dispatcher.recordDeliveryStatus.mock.calls[1][0].providerEventId);
  });
});
