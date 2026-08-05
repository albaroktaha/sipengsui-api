import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateBerkasDto {
  @ApiPropertyOptional({
    description: 'Status kelengkapan berkas',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isComplete?: boolean;

  @ApiPropertyOptional({
    description: 'Catatan petugas',
    example: 'File sudah sesuai format',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateBerkasIsCompleteDto {
  @ApiProperty({
    description: 'Status kelengkapan berkas',
    example: true,
  })
  @IsBoolean()
  isComplete!: boolean;

  @ApiPropertyOptional({
    description: 'Catatan petugas',
    example: 'File sudah sesuai format',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReturnForRevisionDto {
  @ApiProperty({
    description: 'Catatan revisi dari reviewer',
    example:
      'File yang diupload kurang jelas, mohon diupload ulang dengan scan yang lebih baik',
  })
  @IsString()
  @MaxLength(1000)
  revisionNote!: string;
}

export class BerkasQueryDto {
  @ApiPropertyOptional({
    description: 'Filter jenis rekomtek',
    example: 'GALIAN_C',
  })
  @IsOptional()
  @IsString()
  jenis?: string;

  @ApiPropertyOptional({
    description: 'Filter jenis permohonan',
    example: 'IZIN_BARU',
  })
  @IsOptional()
  @IsString()
  jenisPermohonan?: string;
}
