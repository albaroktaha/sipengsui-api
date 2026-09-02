import {
  RekomtekWorkflowStage,
  WhatsAppConsentPurpose,
  WhatsAppOutboxStatus,
} from '@prisma/client';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';

describe('WhatsAppOutboxService', () => {
  it('creates only consented stage jobs with a versioned dedupe key', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = {
      rekomtek: {
        findUnique: jest.fn().mockResolvedValue({
          nomor: 'REK-20260901-001',
          createdById: 'applicant-1',
        }),
      },
      rekomtekTeamAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          members: [{ userId: 'staff-1' }],
        }),
      },
      whatsAppIdentity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'identity-1',
            userId: 'staff-1',
            phoneE164: '+6281234567890',
          },
        ]),
      },
      whatsAppOutbox: { createMany },
    };
    const service = new WhatsAppOutboxService(
      db as never,
      {
        enabled: true,
        maxAttempts: 6,
        appUrl: 'https://sipengsui.example',
        messageVersion: jest.fn().mockReturnValue('v1'),
      } as never,
      {
        resolve: jest.fn().mockReturnValue({
          messageKey: 'STAGE_CHANGED',
          messageVersion: 'v1',
          language: 'id',
          text: 'Permohonan memasuki tahap baru.',
        }),
      } as never,
    );

    await expect(
      service.enqueueWorkflowTransition(db as never, {
        rekomtekId: 'r-1',
        eventId: 'event-1',
        domainEventVersion: 7,
        target: RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL,
        actorId: 'official-1',
      }),
    ).resolves.toBe(1);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientIdentityId: 'identity-1',
          purpose: WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
          messageKey: 'STAGE_CHANGED',
          messageVersion: 'v1',
          textBody: 'Permohonan memasuki tahap baru.',
          status: WhatsAppOutboxStatus.PENDING,
          domainEventVersion: 7,
          dedupeKey: 'event-1:v7:identity-1:WHATSAPP:STAGE_CHANGED:v1',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('does not create a rejection message while the letter is being prepared', async () => {
    const createMany = jest.fn();
    const db = { whatsAppOutbox: { createMany } };
    const service = new WhatsAppOutboxService(
      db as never,
      { enabled: true } as never,
      { resolve: jest.fn() } as never,
    );

    await expect(
      service.enqueueWorkflowTransition(db as never, {
        rekomtekId: 'r-1',
        eventId: 'event-1',
        target: RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN,
      }),
    ).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('notifies eligible assignment officials when the stage has no assignment yet', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = {
      rekomtek: {
        findUnique: jest.fn().mockResolvedValue({
          nomor: 'REK-20260901-001',
          createdById: null,
        }),
      },
      rekomtekTeamAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'official-1' }]),
      },
      whatsAppIdentity: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'official-identity-1',
            userId: 'official-1',
            phoneE164: '+628****7890',
          },
        ]),
      },
      whatsAppOutbox: { createMany },
    };
    const service = new WhatsAppOutboxService(
      db as never,
      {
        enabled: true,
        maxAttempts: 6,
        appUrl: 'https://sipengsui.example',
        messageVersion: jest.fn().mockReturnValue('v1'),
      } as never,
      {
        resolve: jest.fn().mockReturnValue({
          messageKey: 'STAGE_CHANGED',
          messageVersion: 'v1',
          language: 'id',
          text: 'Permohonan menunggu penunjukan Pokja.',
        }),
      } as never,
    );

    await expect(
      service.enqueueWorkflowTransition(db as never, {
        rekomtekId: 'r-1',
        eventId: 'event-assign-1',
        target: RekomtekWorkflowStage.MENUNGGU_PENUNJUKAN_POKJA,
      }),
    ).resolves.toBe(1);
    expect(db.user.findMany).toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientIdentityId: 'official-identity-1',
          provider: 'waha',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('records a durable skip reason when a stage recipient is not eligible', async () => {
    const skipCreateMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = {
      rekomtek: {
        findUnique: jest.fn().mockResolvedValue({
          nomor: 'REK-20260901-001',
          createdById: null,
        }),
      },
      rekomtekTeamAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          members: [{ userId: 'staff-1' }],
        }),
      },
      whatsAppIdentity: { findMany: jest.fn().mockResolvedValue([]) },
      whatsAppOutbox: { createMany: jest.fn() },
      whatsAppOutboxSkipEvent: { createMany: skipCreateMany },
    };
    const service = new WhatsAppOutboxService(
      db as never,
      {
        enabled: true,
        maxAttempts: 6,
        messageVersion: jest.fn().mockReturnValue('v1'),
      } as never,
      { resolve: jest.fn() } as never,
    );

    await expect(
      service.enqueueWorkflowTransition(db as never, {
        rekomtekId: 'r-1',
        eventId: 'event-skip-1',
        target: RekomtekWorkflowStage.EVALUASI_DOKUMEN_AWAL,
      }),
    ).resolves.toBe(0);
    expect(skipCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: 'staff-1',
          messageKey: 'STAGE_CHANGED',
          reason: 'IDENTITY_OR_CONSENT_NOT_ELIGIBLE',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('creates an invitation job for an external participant with verified consent', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const db = {
      rekomtekExposeSchedule: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'schedule-1',
          rekomtekId: 'r-1',
          startsAt: new Date('2026-09-10T02:00:00.000Z'),
          endsAt: new Date('2026-09-10T03:00:00.000Z'),
          timeZone: 'Asia/Jakarta',
          method: 'DARING',
          venue: null,
          agenda: 'Pembahasan permohonan',
          invitationNumber: 'UND/001/2026',
          participants: [
            'applicant-1',
            {
              type: 'EXTERNAL',
              name: 'Peserta Eksternal',
              organization: 'Dinas Contoh',
              whatsappNumber: '+6281234567890',
            },
          ],
          responsibleUserId: 'official-1',
          scheduleVersion: 1,
          status: 'TERJADWAL',
          rekomtek: { nomor: 'REK-20260901-001' },
        }),
      },
      whatsAppIdentity: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { id: 'external-identity-1', phoneE164: '+6281234567890' },
          ]),
      },
      whatsAppOutbox: { createMany },
    };
    const service = new WhatsAppOutboxService(
      db as never,
      {
        enabled: true,
        defaultCountryCode: '62',
        defaultLanguage: 'id',
        maxAttempts: 6,
        appUrl: 'https://sipengsui.example',
        messageVersion: jest.fn().mockReturnValue('v1'),
      } as never,
      {
        resolve: jest.fn().mockReturnValue({
          messageKey: 'EXPOSE_INVITATION',
          messageVersion: 'v1',
          language: 'id',
          text: 'Undangan Ekspose UND/001/2026.',
        }),
      } as never,
    );

    await expect(
      service.enqueueExposeInvitation(db as never, {
        scheduleId: 'schedule-1',
        eventId: 'event-expose-1',
      }),
    ).resolves.toBe(1);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientIdentityId: 'external-identity-1',
          messageKey: 'EXPOSE_INVITATION',
          messageVersion: 'v1',
          textBody: 'Undangan Ekspose UND/001/2026.',
          scheduleId: 'schedule-1',
          dedupeKey: 'schedule-1:1:external-identity-1:EXPOSE_INVITATION:v1',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('audits an admin requeue of a dead outbox item transactionally', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const tx = {
      whatsAppOutbox: { updateMany },
      whatsAppAdminAuditEvent: { create: auditCreate },
    };
    const prisma = {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new WhatsAppOutboxService(
      prisma as never,
      { enabled: true } as never,
      {} as never,
    );

    await expect(service.requeueDead('outbox-1', 'admin-1')).resolves.toBe(
      true,
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        action: 'REQUEUE_WHATSAPP_OUTBOX',
        actorUserId: 'admin-1',
        outboxId: 'outbox-1',
        metadata: { reason: 'ADMIN_REQUEUE' },
      },
    });
  });
});
