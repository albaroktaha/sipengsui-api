import {
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  IsObject,
  IsInt,
  Min,
  IsArray,
  IsPhoneNumber,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisasterType, DisasterSeverity } from '@prisma/client';

export class CreateDisasterReportDto {
  @ApiProperty()
  @IsString()
  judul: string;

  @ApiProperty({ enum: DisasterType })
  @IsEnum(DisasterType)
  jenis: DisasterType;

  @ApiProperty()
  @IsString()
  deskripsi: string;

  @ApiPropertyOptional({ description: 'Nama pelapor (publik, tanpa login)' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  reporterName?: string;

  @ApiPropertyOptional({
    description: 'Nomor HP/WA pelapor, format internasional 62xxx',
  })
  @IsOptional()
  @IsString()
  @Length(9, 16)
  reporterPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  lokasi?: Record<string, any>;

  @ApiPropertyOptional({ enum: DisasterSeverity })
  @IsOptional()
  @IsEnum(DisasterSeverity)
  severity?: DisasterSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  tanggalKejadian?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'URL file yang sudah di-upload',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachments?: string[];
}

export class UpdateDisasterReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  judul?: string;

  @ApiPropertyOptional({ enum: DisasterType })
  @IsOptional()
  @IsEnum(DisasterType)
  jenis?: DisasterType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deskripsi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reporterName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reporterPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  lokasi?: Record<string, any>;

  @ApiPropertyOptional({ enum: DisasterSeverity })
  @IsOptional()
  @IsEnum(DisasterSeverity)
  severity?: DisasterSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  tanggalKejadian?: string;
}

export class QueryDisasterReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
