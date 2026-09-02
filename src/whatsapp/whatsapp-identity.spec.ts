/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  WhatsAppConsentPurpose,
  WhatsAppIdentityStatus,
  WhatsAppPairingStatus,
} from '@prisma/client';
import { WhatsAppIdentityService } from './whatsapp-identity.service';
import { hashPairingCode } from './whatsapp-security';

describe('WhatsAppIdentityService', () => {
  function makeConfig() {
    return {
      defaultCountryCode: '62',
      pairingTtlMinutes: 10,
      pairingMaxAttempts: 5,
      pairingRateLimit: 10,
      pairingRateWindowMinutes: 15,
      consentTextVersion: 'v1',
    };
  }

  it('returns a one-time pairing code while persisting only its hash', async () => {
    type CreateInput = {
      data: {
        userId: string;
        codeHash: string;
        expiresAt: Date;
        maxAttempts: number;
      };
    };
    const create = jest
      .fn<Promise<{ id: string }>, [CreateInput]>()
      .mockResolvedValue({ id: 'pairing-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
      whatsAppPairingCode: {
        count: jest.fn().mockResolvedValue(0),
        updateMany,
        create,
      },
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', isActive: true }),
      },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new WhatsAppIdentityService(
      prisma as never,
      makeConfig() as never,
    );

    const result = await service.createPairingCode('user-1');
    const createData = create.mock.calls[0][0].data;
    expect(result.code).toHaveLength(32);
    expect(createData.codeHash).toBe(hashPairingCode(result.code));
    expect(createData.codeHash).not.toBe(result.code);
    expect(createData.maxAttempts).toBe(5);
  });

  it('requires a verified active identity before changing web consent', async () => {
    const upsert = jest.fn().mockResolvedValue({
      purpose: 'REKOMTEK_TRANSACTIONAL',
      active: true,
    });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'consent-audit-1' });
    const prisma = {
      whatsAppIdentity: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'identity-1',
          userId: 'user-1',
          status: 'ACTIVE',
          verifiedAt: new Date(),
        }),
      },
      whatsAppConsent: { upsert },
      whatsAppConsentAuditEvent: { create: auditCreate },
      whatsAppOutbox: { updateMany: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          whatsAppConsent: { upsert },
          whatsAppConsentAuditEvent: { create: auditCreate },
          whatsAppOutbox: { updateMany: jest.fn() },
        }),
      ),
    };
    const service = new WhatsAppIdentityService(
      prisma as never,
      makeConfig() as never,
    );

    await service.setConsentForUser(
      'user-1',
      WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
      true,
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          identityId_purpose: {
            identityId: 'identity-1',
            purpose: 'REKOMTEK_TRANSACTIONAL',
          },
        },
        create: expect.objectContaining({
          identityId: 'identity-1',
          active: true,
          source: 'WEB',
          textVersion: 'v1',
          actorUserId: 'user-1',
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identityId: 'identity-1',
        purpose: 'REKOMTEK_TRANSACTIONAL',
        active: true,
        source: 'WEB',
        actorUserId: 'user-1',
      }),
    });
  });

  it('rate limits repeated pairing-code creation for one user', async () => {
    type PairingTransaction = {
      user: { findUnique: jest.Mock };
      whatsAppPairingCode: {
        count: jest.Mock;
        updateMany: jest.Mock;
        create: jest.Mock;
      };
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', isActive: true }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: PairingTransaction) => unknown) =>
          Promise.resolve(
            callback({
              user: {
                findUnique: jest.fn().mockResolvedValue({ isActive: true }),
              },
              whatsAppPairingCode: {
                count: jest.fn().mockResolvedValue(10),
                updateMany: jest.fn(),
                create: jest.fn(),
              },
            }),
          ),
        ),
    };
    const service = new WhatsAppIdentityService(
      prisma as never,
      makeConfig() as never,
    );

    await expect(service.createPairingCode('user-1')).rejects.toMatchObject({
      status: 429,
    });
  });

  it('marks a provider-seen external number as channel-verified without linking an account', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'identity-1',
      phoneE164: '+6281234567890',
      userId: null,
      verifiedAt: new Date(),
    });
    const prisma = {
      whatsAppIdentity: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert,
      },
    };
    const service = new WhatsAppIdentityService(
      prisma as never,
      makeConfig() as never,
    );

    await service.getOrCreateIdentity('0812 3456 7890', '6281234567890');

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phoneE164: '+6281234567890' },
        create: expect.objectContaining({
          phoneE164: '+6281234567890',
          providerWaId: '6281234567890',
          verifiedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('does not let a valid code take over an identity already linked elsewhere', async () => {
    const existingIdentity = {
      id: 'identity-1',
      phoneE164: '+6281234567890',
      providerWaId: '6281234567890',
      userId: 'user-a',
      status: WhatsAppIdentityStatus.ACTIVE,
      verifiedAt: new Date(),
    };
    const prisma = {
      whatsAppIdentity: {
        findUnique: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: Record<string, string> }) => {
              if (where.phoneE164) return Promise.resolve(existingIdentity);
              if (where.providerWaId) return Promise.resolve(null);
              if (where.id) {
                return Promise.resolve({
                  pairingAttemptCount: 0,
                  pairingAttemptWindowStartedAt: null,
                });
              }
              return Promise.resolve(null);
            },
          ),
        upsert: jest.fn().mockResolvedValue(existingIdentity),
        update: jest.fn().mockResolvedValue(existingIdentity),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      whatsAppPairingCode: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pairing-1',
          userId: 'user-b',
          status: WhatsAppPairingStatus.PENDING,
          expiresAt: new Date(Date.now() + 60_000),
          attemptCount: 0,
          maxAttempts: 5,
        }),
      },
    };
    const service = new WhatsAppIdentityService(
      prisma as never,
      makeConfig() as never,
    );

    await expect(
      service.linkPairingCode('0812 3456 7890', '6281234567890', 'code'),
    ).rejects.toThrow('sudah tertaut');
  });
});
