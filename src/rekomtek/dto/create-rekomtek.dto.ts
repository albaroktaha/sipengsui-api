import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsJSON,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const jenisOptions = ['APU', 'PLTA', 'PLTM', 'GALIAN_C'] as const;
const jenisPermohonanOptions = ['IZIN_BARU', 'PERPANJANGAN'] as const;

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
    enum: [...jenisOptions],
  })
  @IsString()
  @IsIn(jenisOptions)
  jenis!: string;

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
    description: 'Jenis permohonan (Izin Baru / Perpanjangan)',
    example: 'IZIN_BARU',
    enum: ['IZIN_BARU', 'PERPANJANGAN'],
  })
  @IsString()
  @IsIn(['IZIN_BARU', 'PERPANJANGAN'])
  jenisPermohonan!: string;
}
