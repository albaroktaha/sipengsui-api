/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { WhatsAppInboxService } from './whatsapp-inbox.service';

describe('WhatsAppInboxService durable worker', () => {
  it('processes persisted RECEIVED events after an in-process crash', async () => {
    const processInbound = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      whatsAppInboundEvent: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'inbound-1' }, { id: 'inbound-2' }]),
      },
    };
    const service = new WhatsAppInboxService(
      prisma as never,
      { enabled: true } as never,
      { processInbound } as never,
    );

    await service.processReceived();

    expect(prisma.whatsAppInboundEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ status: 'RECEIVED' }),
            expect.objectContaining({ status: 'FAILED' }),
          ]),
        }),
      }),
    );
    expect(processInbound).toHaveBeenNthCalledWith(1, 'inbound-1');
    expect(processInbound).toHaveBeenNthCalledWith(2, 'inbound-2');
  });

  it('retries due FAILED events until the configured attempt limit', async () => {
    const processInbound = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue([{ id: 'failed-1' }]);
    const prisma = {
      whatsAppInboundEvent: { findMany },
    };
    const service = new WhatsAppInboxService(
      prisma as never,
      { enabled: true, inboxMaxAttempts: 3 } as never,
      { processInbound } as never,
    );

    await service.processReceived();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ status: 'RECEIVED' }),
            expect.objectContaining({
              status: 'FAILED',
              attemptCount: { lt: 3 },
            }),
          ]),
        }),
      }),
    );
    expect(processInbound).toHaveBeenCalledWith('failed-1');
  });
});
