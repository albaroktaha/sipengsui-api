import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BerkasSourceType } from '@prisma/client';

export class UpdateBerkasDto {
  @ApiPropertyOptional({
    description: 'Sumber aktif persyaratan',
    enum: BerkasSourceType,
  })
  @IsOptional()
  @IsEnum(BerkasSourceType)
  sourceType?: BerkasSourceType;

  @ApiPropertyOptional({
    description: 'Link satu file Google Drive atau Google Workspace',
    example: 'https://drive.google.com/file/d/abc123/view',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  driveUrl?: string | null;

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

  @ApiPropertyOptional({
    description: 'Filter status verifikasi checklist',
    enum: ['COMPLETE', 'INCOMPLETE'],
  })
  @IsOptional()
  @IsIn(['COMPLETE', 'INCOMPLETE'])
  status?: 'COMPLETE' | 'INCOMPLETE';

  @ApiPropertyOptional({ description: 'Cari kode atau nama persyaratan' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Halaman checklist', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Jumlah checklist per halaman',
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    description: 'Kolom pengurutan checklist',
    enum: ['nomorUrut', 'kode', 'updatedAt'],
    default: 'nomorUrut',
  })
  @IsOptional()
  @IsIn(['nomorUrut', 'kode', 'updatedAt'])
  sortBy?: 'nomorUrut' | 'kode' | 'updatedAt';

  @ApiPropertyOptional({
    description: 'Arah pengurutan',
    enum: ['asc', 'desc'],
    default: 'asc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
