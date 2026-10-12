import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsDateString,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GIS_MAP_CATEGORY_VALUES } from '../constants/gis-map-categories';

class GisMapMetadataDto {
  @ApiPropertyOptional({ example: 'Balai Wilayah Sungai' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceOrganization?: string | null;

  @ApiPropertyOptional({ example: '2025-05-01' })
  @IsOptional()
  @IsDateString()
  surveyDate?: string | null;

  @ApiPropertyOptional({
    example: 10.5,
    description: 'Ketelitian horizontal dalam meter',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  accuracyMeters?: number | null;

  @ApiPropertyOptional({ example: 'EPSG:4326' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sourceCrs?: string | null;

  @ApiPropertyOptional({ example: 'CC BY 4.0' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  license?: string | null;

  @ApiPropertyOptional({ example: 'Wilayah Sungai X' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverage?: string | null;

  @ApiPropertyOptional({ example: 'Digitasi dari survei lapangan' })
  @IsOptional()
  @IsString()
  @MaxLength(3_000)
  qualityNotes?: string | null;
}

export class CreateGisMapDto extends GisMapMetadataDto {
  @ApiProperty({ example: 'Peta Pos Hidrologi Wilayah Sumatera Utara' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    enum: GIS_MAP_CATEGORY_VALUES,
    example: 'PETA_POS_HIDROLOGI',
  })
  @IsEnum(GIS_MAP_CATEGORY_VALUES)
  category!: string;

  @ApiPropertyOptional({ example: 'Peta titik pemantauan pos hidrologi' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;
}

export class UpdateGisMapDto extends GisMapMetadataDto {
  @ApiPropertyOptional({ example: 'Peta Pos Hidrologi Wilayah Sumatera Utara' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: GIS_MAP_CATEGORY_VALUES })
  @IsOptional()
  @IsEnum(GIS_MAP_CATEGORY_VALUES)
  category?: string;

  @ApiPropertyOptional({ example: 'Peta titik pemantauan pos hidrologi' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  description?: string;
}

export class QueryGisMapsDto {
  @ApiPropertyOptional({
    description: 'Filter berdasarkan kategori peta',
    enum: GIS_MAP_CATEGORY_VALUES,
  })
  @IsOptional()
  @IsEnum(GIS_MAP_CATEGORY_VALUES)
  category?: string;

  @ApiPropertyOptional({
    description: 'Filter status: published | draft | all',
    default: 'all',
  })
  @IsOptional()
  @IsIn(['published', 'draft', 'all'])
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 50, description: 'Maksimal 100' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
