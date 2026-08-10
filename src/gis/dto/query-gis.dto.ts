import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryGisDto {
  @ApiPropertyOptional({
    description:
      'Bounding box untuk filter spasial (minLng,minLat,maxLng,maxLat)',
    example: '98.0,3.0,99.0,4.0',
  })
  @IsOptional()
  @IsString()
  bbox?: string;

  @ApiPropertyOptional({
    description: 'Filter berdasarkan tipe station (ARR/AWLR)',
    example: 'ARR',
  })
  @IsOptional()
  @IsString()
  stationType?: string;

  @ApiPropertyOptional({
    default: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    default: 1000,
    description: 'Maksimal data per layer (max 5000)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 1000;
}
