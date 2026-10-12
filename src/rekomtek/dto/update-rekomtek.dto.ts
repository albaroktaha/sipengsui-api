import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import {
  CreateRekomtekDto,
  LEGACY_REKOMTEK_JENIS_OPTIONS,
  REKOMTEK_JENIS_OPTIONS,
} from './create-rekomtek.dto';

const updateJenisOptions = [
  ...REKOMTEK_JENIS_OPTIONS,
  ...LEGACY_REKOMTEK_JENIS_OPTIONS,
] as const;

export class UpdateRekomtekDto extends PartialType(
  OmitType(CreateRekomtekDto, ['jenis'] as const),
) {
  @ApiPropertyOptional({
    description: 'Jenis rekomendasi teknis',
    enum: updateJenisOptions,
  })
  @IsOptional()
  @IsString()
  @IsIn(updateJenisOptions)
  jenis?: string;
}
