import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum } from 'class-validator';
import { WhatsAppConsentPurpose } from '@prisma/client';

export class SetWhatsAppConsentDto {
  @ApiProperty({ enum: WhatsAppConsentPurpose })
  @IsEnum(WhatsAppConsentPurpose)
  purpose!: WhatsAppConsentPurpose;

  @ApiProperty({ description: 'true untuk opt-in, false untuk opt-out' })
  @IsBoolean()
  active!: boolean;
}
