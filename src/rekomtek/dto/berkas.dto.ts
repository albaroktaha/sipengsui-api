import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BerkasSourceType } from '@prisma/client';
import { JenisPermohonan } from '@prisma/client';
import { REKOMTEK_JENIS_OPTIONS } from './create-rekomtek.dto';

export class CreateBerkasTemplateDto {
  @ApiProperty({ description: 'Jenis rekomtek', enum: REKOMTEK_JENIS_OPTIONS })
  @IsIn(REKOMTEK_JENIS_OPTIONS)
  jenis!: (typeof REKOMTEK_JENIS_OPTIONS)[number];

  @ApiProperty({ description: 'Jenis permohonan', enum: JenisPermohonan })
  @IsEnum(JenisPermohonan)
  jenisPermohonan!: JenisPermohonan;

  @ApiProperty({ description: 'Kode checklist unik dalam jenis permohonan' })
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  @MaxLength(32)
  kode!: string;

  @ApiProperty({ description: 'Urutan tampil checklist', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nomorUrut!: number;

  @ApiProperty({ description: 'Nama atau uraian Berkas Persyaratan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  uraian!: string;

  @ApiPropertyOptional({ description: 'Tandai sebagai persyaratan wajib' })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Item memiliki rincian turunan' })
  @IsOptional()
  @IsBoolean()
  hasSubItems?: boolean;
}

export class UpdateBerkasTemplateDto {
  @ApiPropertyOptional({ description: 'Kode checklist' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  @MaxLength(32)
  kode?: string;

  @ApiPropertyOptional({ description: 'Urutan tampil checklist', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nomorUrut?: number;

  @ApiPropertyOptional({ description: 'Nama atau uraian Berkas Persyaratan' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  uraian?: string;

  @ApiPropertyOptional({ description: 'Tandai sebagai persyaratan wajib' })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Item memiliki rincian turunan' })
  @IsOptional()
  @IsBoolean()
  hasSubItems?: boolean;
}

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
    example: 'PERTAMBANGAN_MINERAL_BUKAN_LOGAM_DAN_BATUAN_DI_SUNGAI',
  })
  @IsOptional()
  @IsString()
  jenis?: string;

  @ApiPropertyOptional({
    description: 'Filter jenis permohonan',
    example: 'IZIN_BARU',
  })
  @IsOptional()
  @IsEnum(JenisPermohonan)
  jenisPermohonan?: JenisPermohonan;

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
