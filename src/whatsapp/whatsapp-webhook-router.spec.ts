/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import {
  WhatsAppMessageType,
  WhatsAppConversationState,
  WhatsAppInboundStatus,
} from '@prisma/client';
import { WhatsAppRouterService } from './whatsapp-router.service';

describe('WhatsAppRouterService', () => {
  function makeRouter(
    overrides: Record<string, unknown> = {},
    serviceConsent = true,
    inboundText = 'MENU',
  ) {
    const prisma = {
      whatsAppInboundEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbound-1',
          providerEventId: 'waha-inbound-1',
          identityId: 'identity-1',
          messageType: WhatsAppMessageType.TEXT,
          textBody: inboundText,
          status: WhatsAppInboundStatus.PROCESSING,
          identity: {
            id: 'identity-1',
            phoneE164: '+6281234567890',
            providerWaId: '6281234567890',
            userId: null,
            verifiedAt: null,
            status: 'ACTIVE',
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      whatsAppConversation: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest
          .fn()
          .mockResolvedValue({ state: WhatsAppConversationState.MENU }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      rekomtek: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      ...overrides,
    };
    const outbox = { enqueueTextReply: jest.fn().mockResolvedValue(undefined) };
    const ai = {
      createTextAnswer: jest.fn().mockResolvedValue('jawaban publik'),
    };
    const identity = {
      linkPairingCode: jest.fn(),
      optOutIdentity: jest.fn(),
      setConsentForIdentity: jest.fn(),
      hasActiveConsent: jest.fn().mockResolvedValue(serviceConsent),
    };
    const config = {
      serviceWindowHours: 24,
      conversationStateTtlMinutes: 30,
      aiRateLimit: 10,
      aiRateWindowMinutes: 1,
      statusRateLimit: 10,
      statusRateWindowMinutes: 1,
      appUrl: 'https://sipengsui.example',
    };
    return {
      router: new WhatsAppRouterService(
        prisma as never,
        config as never,
        identity as never,
        outbox as never,
        ai as never,
      ),
      prisma,
      outbox,
      ai,
      identity,
    };
  }

  it('answers MENU without invoking AI', async () => {
    const { router, outbox, ai } = makeRouter();
    await router.processInbound('inbound-1');
    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      expect.stringContaining('BANTUAN'),
      'inbound:waha-inbound-1:reply',
      { consentRequired: false },
    );
    expect(ai.createTextAnswer).not.toHaveBeenCalled();
  });

  it('does not disclose an owned status record to another identity', async () => {
    const { router, outbox, prisma } = makeRouter({
      whatsAppInboundEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbound-1',
          providerEventId: 'waha-inbound-1',
          identityId: 'identity-1',
          messageType: WhatsAppMessageType.TEXT,
          textBody: 'STATUS REK-20260901-001',
          identity: {
            id: 'identity-1',
            phoneE164: '+6281234567890',
            providerWaId: '6281234567890',
            userId: 'user-1',
            verifiedAt: new Date(),
            status: 'ACTIVE',
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      rekomtek: {
        findUnique: jest.fn().mockResolvedValue({
          createdById: 'user-2',
          nomor: 'REK-20260901-001',
          judul: 'Permohonan privat',
          workflowStage: 'EVALUASI_DOKUMEN_AWAL',
          status: 'REVIEW',
          updatedAt: new Date(),
        }),
        findMany: jest.fn(),
      },
    });
    await router.processInbound('inbound-1');
    expect(prisma.rekomtek.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { nomor: 'REK-20260901-001' } }),
    );
    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      'Permohonan tidak ditemukan atau tidak tersedia untuk nomor WhatsApp ini.',
      expect.any(String),
      { consentRequired: true },
    );
  });

  it('uses the channel-neutral AI service for public questions', async () => {
    const { router, outbox, ai } = makeRouter({
      whatsAppInboundEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbound-1',
          providerEventId: 'waha-inbound-1',
          identityId: 'identity-1',
          messageType: WhatsAppMessageType.TEXT,
          textBody: 'Bagaimana cara melihat peta publik?',
          identity: {
            id: 'identity-1',
            phoneE164: '+6281234567890',
            providerWaId: '6281234567890',
            userId: null,
            verifiedAt: null,
            status: 'ACTIVE',
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    });
    await router.processInbound('inbound-1');
    expect(ai.createTextAnswer).toHaveBeenCalledWith({
      question: 'Bagaimana cara melihat peta publik?',
      userId: undefined,
      roles: [],
      channel: 'WHATSAPP',
    });
    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      'jawaban publik',
      expect.any(String),
      { consentRequired: true },
    );
  });

  it('requires service consent before sending a public AI question', async () => {
    const { router, outbox, ai } = makeRouter({}, false, 'Apa itu SIPENGSUI?');

    await router.processInbound('inbound-1');
    expect(ai.createTextAnswer).not.toHaveBeenCalled();
    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      expect.stringContaining('SETUJU LAYANAN'),
      expect.any(String),
      { consentRequired: false },
    );
  });

  it('lets a verified external identity start transactional notification consent', async () => {
    const { router, outbox, prisma } = makeRouter(
      {
        whatsAppInboundEvent: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'inbound-1',
            providerEventId: 'waha-inbound-1',
            identityId: 'identity-1',
            messageType: WhatsAppMessageType.TEXT,
            textBody: 'MULAI NOTIFIKASI',
            status: WhatsAppInboundStatus.PROCESSING,
            identity: {
              id: 'identity-1',
              phoneE164: '+6281234567890',
              providerWaId: '6281234567890',
              userId: null,
              verifiedAt: new Date(),
              status: 'ACTIVE',
            },
          }),
          update: jest.fn().mockResolvedValue(undefined),
        },
      },
      true,
      'MULAI NOTIFIKASI',
    );

    await router.processInbound('inbound-1');

    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      expect.stringContaining('SETUJU NOTIFIKASI'),
      expect.any(String),
      { consentRequired: false },
    );
    expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: WhatsAppConversationState.AWAITING_TRANSACTIONAL_CONSENT,
        }),
      }),
    );
  });

  it('accepts the raw pairing token shown by the profile UI', async () => {
    const rawCode = 'AbcdefghijklmnopqrstuvwxYZ012345';
    const { router, outbox, identity, ai } = makeRouter({}, true, rawCode);

    await router.processInbound('inbound-1');

    expect(identity.linkPairingCode).toHaveBeenCalledTimes(1);
    expect(identity.linkPairingCode.mock.calls[0][2]).toBe(rawCode);
    expect(ai.createTextAnswer).not.toHaveBeenCalled();
    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      expect.stringContaining('berhasil ditautkan'),
      expect.any(String),
      { consentRequired: false },
    );
  });

  it('records external transactional consent without linking a SIPENGSUI account', async () => {
    const { router, outbox, identity } = makeRouter(
      {
        whatsAppInboundEvent: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'inbound-1',
            providerEventId: 'waha-inbound-1',
            identityId: 'identity-1',
            messageType: WhatsAppMessageType.TEXT,
            textBody: 'SETUJU NOTIFIKASI',
            status: WhatsAppInboundStatus.PROCESSING,
            identity: {
              id: 'identity-1',
              phoneE164: '+6281234567890',
              providerWaId: '6281234567890',
              userId: null,
              verifiedAt: new Date(),
              status: 'ACTIVE',
            },
          }),
          update: jest.fn().mockResolvedValue(undefined),
        },
        whatsAppConversation: {
          findUnique: jest.fn().mockResolvedValue({
            state: WhatsAppConversationState.AWAITING_TRANSACTIONAL_CONSENT,
          }),
          upsert: jest.fn().mockResolvedValue({
            state: WhatsAppConversationState.AWAITING_TRANSACTIONAL_CONSENT,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      },
      true,
      'SETUJU NOTIFIKASI',
    );

    await router.processInbound('inbound-1');

    expect(identity.setConsentForIdentity).toHaveBeenCalledWith(
      'identity-1',
      'REKOMTEK_TRANSACTIONAL',
      true,
      'WHATSAPP',
      undefined,
    );
    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      expect.stringContaining('diaktifkan'),
      expect.any(String),
      { consentRequired: false },
    );
  });

  it('stops AI requests after the per-number window is full', async () => {
    const { router, outbox, ai, prisma } = makeRouter(
      {},
      true,
      'Apa itu SIPENGSUI?',
    );
    prisma.whatsAppConversation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        aiRequestCount: 10,
        aiRequestWindowStartedAt: new Date(),
      });

    await router.processInbound('inbound-1');
    expect(ai.createTextAnswer).not.toHaveBeenCalled();
    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      expect.stringContaining('terlalu sering'),
      expect.any(String),
      { consentRequired: true },
    );
  });

  it('stops STATUS lookups after the per-number window is full', async () => {
    const { router, outbox, prisma } = makeRouter({
      whatsAppInboundEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'inbound-1',
          providerEventId: 'waha-status-limit',
          identityId: 'identity-1',
          messageType: WhatsAppMessageType.TEXT,
          textBody: 'STATUS REK-20260901-001',
          status: WhatsAppInboundStatus.PROCESSING,
          identity: {
            id: 'identity-1',
            phoneE164: '+628****7890',
            providerWaId: '6281234567890',
            userId: 'user-1',
            verifiedAt: new Date(),
            status: 'ACTIVE',
          },
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      whatsAppConversation: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            statusRequestCount: 10,
            statusRequestWindowStartedAt: new Date(),
          }),
        upsert: jest.fn().mockResolvedValue({
          state: WhatsAppConversationState.MENU,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });

    await router.processInbound('inbound-1');

    expect(prisma.rekomtek.findUnique).not.toHaveBeenCalled();
    expect(outbox.enqueueTextReply).toHaveBeenCalledWith(
      'identity-1',
      expect.stringContaining('terlalu sering'),
      expect.any(String),
      { consentRequired: false },
    );
  });

  it('leaves a transient routing failure retryable with a backoff timestamp', async () => {
    const { router, prisma, ai } = makeRouter(
      {
        whatsAppInboundEvent: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            id: 'inbound-1',
            providerEventId: 'waha-retryable',
            identityId: 'identity-1',
            messageType: WhatsAppMessageType.TEXT,
            textBody: 'Pertanyaan publik',
            attemptCount: 1,
            status: WhatsAppInboundStatus.PROCESSING,
            identity: {
              id: 'identity-1',
              phoneE164: '+628****7890',
              providerWaId: '6281234567890',
              userId: null,
              verifiedAt: null,
              status: 'ACTIVE',
            },
          }),
          update: jest.fn().mockResolvedValue(undefined),
        },
      },
      true,
      'Pertanyaan publik',
    );
    ai.createTextAnswer.mockRejectedValue(new Error('temporary AI outage'));

    await router.processInbound('inbound-1');

    expect(prisma.whatsAppInboundEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inbound-1' },
        data: expect.objectContaining({
          status: WhatsAppInboundStatus.FAILED,
          processedAt: null,
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });
});
