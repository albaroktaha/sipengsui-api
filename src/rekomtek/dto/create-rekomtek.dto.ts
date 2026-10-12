import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsJSON,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const REKOMTEK_JENIS_OPTIONS = [
  'APU',
  'PLTA_PLTM',
  'PEMINDAHAN_ALUR_SUNGAI',
  'PERSETUJUAN_KONSTRUKSI_DI_BADAN_SUNGAI',
  'PERTAMBANGAN_MINERAL_BUKAN_LOGAM_DAN_BATUAN_DI_SUNGAI',
] as const;

export const LEGACY_REKOMTEK_JENIS_OPTIONS = [
  'PLTA',
  'PLTM',
  'GALIAN_C',
  'AMDES',
  'IRIGASI',
  'AIR_BERSIH',
  'OTHER',
] as const;

const jenisPermohonanOptions = [
  'IZIN_BARU',
  'PERPANJANGAN',
  'PERSETUJUAN_TEKNIS',
] as const;

export const JENIS_SUMBER_AIR_OPTIONS = [
  'SUNGAI',
  'DANAU',
  'EMBUNG',
  'SALURAN_IRIGASI',
  'SALURAN_ALAMI_PEMBUANG',
  'MATA_AIR',
  'TAMPUNGAN_LAINNYA',
] as const;

export class CreateRekomtekDto {
  @ApiProperty({
    description: 'Nomor dokumen rekomendasi teknis',
    example: '001/REKOMTEK/BBWS/VII/2026',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  nomor!: string;

  @ApiProperty({
    description: 'Judul rekomendasi teknis',
    example: 'Rekomendasi Teknis Curah Hujan Stasiun Namo Bintang',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  judul!: string;

  @ApiProperty({
    description: 'Jenis rekomendasi teknis',
    example: 'APU',
    enum: [...REKOMTEK_JENIS_OPTIONS],
  })
  @IsString()
  @IsIn(REKOMTEK_JENIS_OPTIONS)
  jenis!: string;

  @ApiProperty({
    description: 'Jenis sumber air',
    example: 'SUNGAI',
    enum: [...JENIS_SUMBER_AIR_OPTIONS],
  })
  @IsString()
  @IsIn(JENIS_SUMBER_AIR_OPTIONS)
  jenisSumberAir!: string;

  @ApiPropertyOptional({
    description: 'Deskripsi rekomendasi teknis',
    example: 'Analisis data curah hujan periode Januari-Juni 2026',
  })
  @IsOptional()
  @IsString()
  deskripsi?: string;

  @ApiPropertyOptional({
    description: 'ID Station (jika terkait stasiun tertentu)',
  })
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @ApiPropertyOptional({
    description: 'ID Sungai (jika terkait sungai tertentu)',
  })
  @IsOptional()
  @IsUUID()
  riverId?: string;

  @ApiPropertyOptional({
    description: 'Nama sungai input manual (jika tidak ada di database)',
    example: 'Sungai Ciliwung (manual)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customRiverName?: string;

  @ApiPropertyOptional({
    description: 'ID DAS / Watershed',
  })
  @IsOptional()
  @IsUUID()
  watershedId?: string;

  @ApiPropertyOptional({
    description: 'ID Wilayah Sungai',
  })
  @IsOptional()
  @IsUUID()
  riverRegionId?: string;

  @ApiPropertyOptional({
    description: 'Lintang titik lokasi permohonan dalam derajat',
    example: -6.2,
    minimum: -90,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @ApiPropertyOptional({
    description: 'Bujur titik lokasi permohonan dalam derajat',
    example: 106.8,
    minimum: -180,
    maximum: 180,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({
    description: 'Data analisis dalam format JSON',
    example: '{"meanRainfall": 250.5, "maxRainfall": 320.0}',
  })
  @IsOptional()
  @IsJSON()
  analysisData?: string;

  @ApiPropertyOptional({
    description: 'Parameter yang dianalisis',
    example: '{"rainfallThreshold": 100, "waterLevelThreshold": 5.0}',
  })
  @IsOptional()
  @IsJSON()
  parameters?: string;

  @ApiPropertyOptional({
    description: 'Path file dokumen yang dihasilkan',
    example: '/uploads/rekomtek/001-rekomtek-bbws-vii-2026.pdf',
  })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiProperty({
    description: 'Nama pembuat rekomendasi teknis',
    example: 'Budi Santoso',
  })
  @IsString()
  createdBy!: string;

  @ApiProperty({
    description:
      'Jenis permohonan (Izin Baru / Perpanjangan / Persetujuan Teknis)',
    example: 'IZIN_BARU',
    enum: [...jenisPermohonanOptions],
  })
  @IsString()
  @IsIn(jenisPermohonanOptions)
  jenisPermohonan!: string;
}
