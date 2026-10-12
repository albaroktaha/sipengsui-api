import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { RekomtekController } from './rekomtek.controller';
import { RekomtekService } from './rekomtek.service';
import { BerkasController } from './berkas.controller';
import { BerkasService } from './berkas.service';
import { BerkasTemplateService } from './berkas-template.service';
import { ChecklistTemplateManagementGuard } from './guards/checklist-template-management.guard';
import { DriveAccessValidator } from './drive-access.service';
import { BerkasFileStorageService } from './berkas-file-storage.service';
import { RekomtekWorkflowService } from './rekomtek-workflow.service';
import { RejectionLetterApprovalService } from './rejection-letter-approval.service';
import { RejectionLetterVerificationController } from './rejection-letter-verification.controller';

@Module({
  imports: [MailModule, WhatsAppModule],
  controllers: [
    RekomtekController,
    BerkasController,
    RejectionLetterVerificationController,
  ],
  providers: [
    RekomtekService,
    BerkasService,
    BerkasTemplateService,
    ChecklistTemplateManagementGuard,
    DriveAccessValidator,
    BerkasFileStorageService,
    RekomtekWorkflowService,
    RejectionLetterApprovalService,
  ],
})
export class RekomtekModule {}
