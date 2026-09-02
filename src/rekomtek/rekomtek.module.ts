import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { RekomtekController } from './rekomtek.controller';
import { RekomtekService } from './rekomtek.service';
import { BerkasController } from './berkas.controller';
import { BerkasService } from './berkas.service';
import { BerkasTemplateService } from './berkas-template.service';
import { DriveAccessValidator } from './drive-access.service';
import { BerkasFileStorageService } from './berkas-file-storage.service';
import { RekomtekWorkflowService } from './rekomtek-workflow.service';

@Module({
  imports: [MailModule, WhatsAppModule],
  controllers: [RekomtekController, BerkasController],
  providers: [
    RekomtekService,
    BerkasService,
    BerkasTemplateService,
    DriveAccessValidator,
    BerkasFileStorageService,
    RekomtekWorkflowService,
  ],
})
export class RekomtekModule {}
