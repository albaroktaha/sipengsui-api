import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WhatsAppInboundStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppConfig } from './whatsapp.config';
import { WhatsAppRouterService } from './whatsapp-router.service';

@Injectable()
export class WhatsAppInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WhatsAppConfig,
    private readonly router: WhatsAppRouterService,
  ) {}

  process(inboundEventId: string): Promise<void> {
    return this.router.processInbound(inboundEventId);
  }

  @Cron('*/15 * * * * *')
  async processReceived(): Promise<void> {
    if (!this.config.enabled) return;
    const now = new Date();
    const inboxMaxAttempts = this.config.inboxMaxAttempts ?? 6;
    const received = await this.prisma.whatsAppInboundEvent.findMany({
      where: {
        OR: [
          {
            status: WhatsAppInboundStatus.RECEIVED,
            nextAttemptAt: { lte: now },
          },
          {
            status: WhatsAppInboundStatus.FAILED,
            attemptCount: { lt: inboxMaxAttempts },
            nextAttemptAt: { lte: now },
          },
        ],
      },
      select: { id: true },
      orderBy: { receivedAt: 'asc' },
      take: 25,
    });
    for (const event of received) {
      try {
        await this.router.processInbound(event.id);
      } catch {
        // Router menyimpan error yang dapat dipulihkan; worker lanjut ke event berikutnya.
      }
    }
  }

  @Cron('*/30 * * * * *')
  async recoverStaleProcessing(): Promise<void> {
    if (!this.config.enabled) return;
    const inboxMaxAttempts = this.config.inboxMaxAttempts ?? 6;
    const cutoff = new Date(Date.now() - 5 * 60_000);
    const staleEvents = await this.prisma.whatsAppInboundEvent.findMany({
      where: {
        status: WhatsAppInboundStatus.PROCESSING,
        updatedAt: { lt: cutoff },
      },
      select: { id: true, attemptCount: true },
      take: 25,
    });
    for (const event of staleEvents) {
      const reset = await this.prisma.whatsAppInboundEvent.updateMany({
        where: { id: event.id, status: WhatsAppInboundStatus.PROCESSING },
        data: {
          status: WhatsAppInboundStatus.FAILED,
          errorCode: 'RECOVERED_STALE_PROCESSING',
          nextAttemptAt:
            event.attemptCount < inboxMaxAttempts ? new Date() : null,
        },
      });
      if (reset.count === 1 && event.attemptCount < inboxMaxAttempts) {
        void this.router.processInbound(event.id).catch(() => undefined);
      }
    }
  }
}
