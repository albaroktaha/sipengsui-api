import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { RekomtekStatus } from '@prisma/client';

export class QueryRekomtekDto {
  @ApiPropertyOptional({
    description: 'Filter berdasarkan status',
    enum: RekomtekStatus,
  })
  @IsOptional()
  @IsEnum(RekomtekStatus)
  status?: RekomtekStatus;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID Station',
  })
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID DAS / Watershed',
  })
  @IsOptional()
  @IsUUID()
  watershedId?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan ID Wilayah Sungai',
  })
  @IsOptional()
  @IsUUID()
  riverRegionId?: string;

  @ApiPropertyOptional({
    description: 'Filter kata kunci (judul, nomor, deskripsi)',
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: 'Filter tanggal mulai (createdAt)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter tanggal akhir (createdAt)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Halaman',
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    description: 'Jumlah data per halaman',
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 20;
}
