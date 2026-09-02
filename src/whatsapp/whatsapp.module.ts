import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../modules/ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WahaWhatsAppProvider } from './waha-whatsapp.provider';
import { WhatsAppConfig } from './whatsapp.config';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppDispatcherService } from './whatsapp-dispatcher.service';
import { WhatsAppIdentityService } from './whatsapp-identity.service';
import { WhatsAppInboxService } from './whatsapp-inbox.service';
import { WhatsAppOutboxService } from './whatsapp-outbox.service';
import { WhatsAppRouterService } from './whatsapp-router.service';
import { WhatsAppMessageRegistry } from './whatsapp-message.registry';
import { WhatsAppMetricsService } from './whatsapp-metrics.service';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WHATSAPP_PROVIDER } from './whatsapp.types';

@Module({
  imports: [ConfigModule, PrismaModule, AiModule],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppConfig,
    WhatsAppMessageRegistry,
    WhatsAppMetricsService,
    WhatsAppIdentityService,
    WhatsAppOutboxService,
    WhatsAppDispatcherService,
    WhatsAppRouterService,
    WhatsAppInboxService,
    WhatsAppWebhookService,
    {
      provide: WHATSAPP_PROVIDER,
      useClass: WahaWhatsAppProvider,
    },
  ],
  exports: [WhatsAppConfig, WhatsAppIdentityService, WhatsAppOutboxService],
})
export class WhatsAppModule {}
