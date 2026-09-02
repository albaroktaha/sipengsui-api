/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  WhatsAppConsentPurpose,
  WhatsAppDeliveryStatus,
  WhatsAppIdentityStatus,
  WhatsAppOutboxStatus,
} from '@prisma/client';
import { WhatsAppDispatcherService } from './whatsapp-dispatcher.service';
import { WhatsAppProviderError } from './whatsapp.types';

function config(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    outboxBatchSize: 10,
    responseTimeoutMs: 1_000,
    retentionDays: 90,
    exposeRemindersEnabled: false,
    ...overrides,
  };
}

describe('WhatsAppDispatcherService', () => {
  it('does not claim outbox work while the kill switch is disabled', async () => {
    const findMany = jest.fn();
    const dispatcher = new WhatsAppDispatcherService(
      { whatsAppOutbox: { findMany } } as never,
      config({ enabled: false }) as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 0,
      completed: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does not claim work while the WAHA session is not working', async () => {
    const findMany = jest.fn();
    const dispatcher = new WhatsAppDispatcherService(
      { whatsAppOutbox: { findMany } } as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'SCAN_QR_CODE',
          isWorking: false,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 0,
      completed: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('dead-letters queued work when health fails permanently', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = {
      whatsAppOutbox: {
        findMany: jest.fn(),
        updateMany,
      },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: jest
          .fn()
          .mockRejectedValue(
            new WhatsAppProviderError(
              'WAHA menolak permintaan',
              'PERMANENT',
              'HTTP_401',
            ),
          ),
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 0,
      completed: 0,
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [WhatsAppOutboxStatus.PENDING, WhatsAppOutboxStatus.RETRY],
          },
        }),
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.DEAD,
          lastErrorCode: 'HTTP_401',
        }),
      }),
    );
  });

  it('does not claim work when another replica owns the session lock', async () => {
    const findMany = jest.fn();
    const health = jest.fn();
    const prisma = {
      whatsAppDispatchLock: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      whatsAppOutbox: { findMany },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: health,
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 0,
      completed: 0,
    });
    expect(health).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('retries transient provider errors with a bounded retry state', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const prisma = {
      whatsAppOutbox: {
        findMany: jest.fn().mockResolvedValue([{ id: 'outbox-1' }]),
        updateMany,
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-1',
          purpose: WhatsAppConsentPurpose.SERVICE_CONVERSATION,
          messageKey: 'CONVERSATION_REPLY',
          messageVersion: 'v1',
          textBody: 'Balasan',
          scheduleId: null,
          recipientIdentity: {
            id: 'identity-1',
            phoneE164: '+6281234567890',
            status: 'ACTIVE',
            verifiedAt: new Date(),
            user: { isActive: true },
            consents: [],
            conversation: {
              serviceWindowExpiresAt: new Date(Date.now() + 60_000),
            },
          },
          attemptCount: 0,
          maxAttempts: 3,
        }),
      },
      whatsAppConversation: { updateMany: jest.fn() },
    };
    const provider = {
      sendText: jest
        .fn()
        .mockRejectedValue(
          new WhatsAppProviderError(
            'provider busy',
            'TRANSIENT',
            'HTTP_429',
            1,
          ),
        ),
      getSessionHealth: jest.fn().mockResolvedValue({
        session: 'default',
        status: 'WORKING',
        isWorking: true,
      }),
      observeSessionStatus: jest.fn(),
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      provider,
    );

    await expect(dispatcher.dispatchBatch()).resolves.toEqual({
      claimed: 1,
      completed: 1,
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'outbox-1' }),
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.RETRY,
          attemptCount: 1,
          lastErrorCode: 'HTTP_429',
        }),
      }),
    );
  });

  it('ignores delivery updates that would downgrade a delivered message', async () => {
    const updateMany = jest.fn();
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-1',
          status: WhatsAppOutboxStatus.DELIVERED,
        }),
        updateMany,
      },
      whatsAppDeliveryEvent: {
        create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
      },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(
      dispatcher.recordDeliveryStatus({
        providerEventId: 'waha-message:SERVER:1',
        providerMessageId: 'waha-message',
        ack: 1,
        ackName: 'SERVER',
      }),
    ).resolves.toBe(true);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('persists and advances a delivery status when it is newer', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const deliveryCreate = jest.fn().mockResolvedValue({ id: 'delivery-1' });
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-1',
          status: WhatsAppOutboxStatus.SENT,
        }),
        updateMany,
      },
      whatsAppDeliveryEvent: { create: deliveryCreate },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(
      dispatcher.recordDeliveryStatus({
        providerEventId: 'waha-message:DEVICE:2',
        providerMessageId: 'waha-message',
        ack: 2,
        ackName: 'DEVICE',
      }),
    ).resolves.toBe(true);
    expect(deliveryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WhatsAppDeliveryStatus.DELIVERED,
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.DELIVERED,
        }),
      }),
    );
  });

  it('records an ACK error while preserving a later delivered state', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-1',
          status: WhatsAppOutboxStatus.SENT,
        }),
        updateMany,
      },
      whatsAppDeliveryEvent: {
        create: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
      },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(
      dispatcher.recordDeliveryStatus({
        providerEventId: 'waha-error-1',
        providerMessageId: 'waha-message-1',
        ack: -1,
        ackName: 'ERROR',
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.FAILED,
          lastErrorCode: 'WAHA_ACK_ERROR',
        }),
      }),
    );
  });

  it('keeps an early ACK as an orphan until the send response is persisted', async () => {
    const deliveryCreate = jest
      .fn()
      .mockResolvedValue({ id: 'delivery-early' });
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      whatsAppDeliveryEvent: { create: deliveryCreate },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(
      dispatcher.recordDeliveryStatus({
        providerEventId: 'waha-early-ack',
        providerMessageId: 'waha-message-early',
        ack: 2,
        ackName: 'DEVICE',
      }),
    ).resolves.toBe(true);
    expect(deliveryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outboxId: null,
          providerMessageId: 'waha-message-early',
          providerAck: 2,
          status: WhatsAppDeliveryStatus.DELIVERED,
        }),
      }),
    );
  });

  it('retries advancing an ACK after a duplicate delivery audit row', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-1',
          status: WhatsAppOutboxStatus.SENT,
        }),
        updateMany,
      },
      whatsAppDeliveryEvent: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'delivery-1',
          outboxId: 'outbox-1',
          providerAck: 2,
          providerTimestamp: null,
        }),
      },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText: jest.fn(),
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await expect(
      dispatcher.recordDeliveryStatus({
        providerEventId: 'waha-duplicate-ack',
        providerMessageId: 'waha-message-1',
        ack: 2,
        ackName: 'DEVICE',
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.DELIVERED,
        }),
      }),
    );
  });

  it('cancels a normal service reply when service consent is inactive', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const sendText = jest.fn();
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-service',
          purpose: WhatsAppConsentPurpose.SERVICE_CONVERSATION,
          consentRequired: true,
          textBody: 'Jawaban layanan',
          recipientIdentity: {
            id: 'identity-1',
            phoneE164: '+6281234567890',
            userId: null,
            status: WhatsAppIdentityStatus.ACTIVE,
            verifiedAt: new Date(),
            user: null,
            consents: [],
            conversation: null,
          },
        }),
        updateMany,
      },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText,
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await (
      dispatcher as never as {
        processOne(id: string, lockedBy: string): Promise<boolean>;
      }
    ).processOne('outbox-service', 'lock-1');

    expect(sendText).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.CANCELLED,
          lastErrorCode: 'CONSENT_REVOKED',
        }),
      }),
    );
  });

  it('allows a consent prompt marked as system-required without service consent', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const sendText = jest.fn().mockResolvedValue({
      providerMessageId: 'waha-service-prompt',
    });
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-prompt',
          purpose: WhatsAppConsentPurpose.SERVICE_CONVERSATION,
          consentRequired: false,
          textBody: 'Persetujuan layanan diperlukan.',
          recipientIdentity: {
            id: 'identity-1',
            phoneE164: '+6281234567890',
            userId: null,
            status: WhatsAppIdentityStatus.ACTIVE,
            verifiedAt: new Date(),
            user: null,
            consents: [],
            conversation: null,
          },
        }),
        updateMany,
      },
      whatsAppDeliveryEvent: { findMany: jest.fn().mockResolvedValue([]) },
      whatsAppConversation: { updateMany: jest.fn().mockResolvedValue({}) },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText,
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await (
      dispatcher as never as {
        processOne(id: string, lockedBy: string): Promise<boolean>;
      }
    ).processOne('outbox-prompt', 'lock-1');

    expect(sendText).toHaveBeenCalledWith({
      to: '+6281234567890',
      text: 'Persetujuan layanan diperlukan.',
    });
  });

  it('defers a claimed row when session health changes before send', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const sendText = jest.fn();
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-health',
          purpose: WhatsAppConsentPurpose.SERVICE_CONVERSATION,
          consentRequired: false,
          textBody: 'Pesan layanan',
          recipientIdentity: {
            id: 'identity-1',
            phoneE164: '+6281234567890',
            userId: null,
            status: WhatsAppIdentityStatus.ACTIVE,
            verifiedAt: new Date(),
            user: null,
            consents: [],
            conversation: null,
          },
        }),
        updateMany,
      },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText,
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'STOPPED',
          isWorking: false,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await (
      dispatcher as never as {
        processOne(id: string, lockedBy: string): Promise<boolean>;
      }
    ).processOne('outbox-health', 'lock-1');

    expect(sendText).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.PENDING,
          lastErrorCode: 'SESSION_NOT_WORKING',
        }),
      }),
    );
  });

  it('does not send when consent revocation wins the final reservation race', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });
    const sendText = jest.fn();
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-race',
          purpose: WhatsAppConsentPurpose.SERVICE_CONVERSATION,
          consentRequired: true,
          textBody: 'Pesan layanan',
          recipientIdentity: {
            id: 'identity-1',
            phoneE164: '+6281234567890',
            userId: null,
            status: WhatsAppIdentityStatus.ACTIVE,
            verifiedAt: new Date(),
            user: null,
            consents: [
              {
                purpose: WhatsAppConsentPurpose.SERVICE_CONVERSATION,
                active: true,
              },
            ],
          },
        }),
        updateMany,
      },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText,
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await (
      dispatcher as never as {
        processOne(id: string, lockedBy: string): Promise<boolean>;
      }
    ).processOne('outbox-race', 'lock-1');

    expect(sendText).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.CANCELLED,
          lastErrorCode: 'CONSENT_REVOKED',
        }),
      }),
    );
  });

  it('dead-letters an accepted send when the SENT CAS no longer matches', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const sendText = jest.fn().mockResolvedValue({
      providerMessageId: 'waha-accepted-without-cas',
    });
    const prisma = {
      whatsAppOutbox: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'outbox-cas',
          purpose: WhatsAppConsentPurpose.SERVICE_CONVERSATION,
          consentRequired: false,
          textBody: 'Pesan layanan',
          recipientIdentity: {
            id: 'identity-1',
            phoneE164: '+628****7890',
            userId: null,
            status: WhatsAppIdentityStatus.ACTIVE,
            verifiedAt: new Date(),
            user: null,
            consents: [],
            conversation: null,
          },
        }),
        updateMany,
      },
      whatsAppDeliveryEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const dispatcher = new WhatsAppDispatcherService(
      prisma as never,
      config() as never,
      { enqueueExposeReminders: jest.fn() } as never,
      {
        sendText,
        getSessionHealth: jest.fn().mockResolvedValue({
          session: 'default',
          status: 'WORKING',
          isWorking: true,
        }),
        observeSessionStatus: jest.fn(),
      },
    );

    await (
      dispatcher as never as {
        processOne(id: string, lockedBy: string): Promise<boolean>;
      }
    ).processOne('outbox-cas', 'lock-1');

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'outbox-cas',
          sendStartedAt: expect.any(Date),
        }),
        data: expect.objectContaining({
          status: WhatsAppOutboxStatus.DEAD,
          providerMessageId: 'waha-accepted-without-cas',
          lastErrorCode: 'PROVIDER_RESULT_PERSISTENCE_UNKNOWN',
        }),
      }),
    );
  });
});
