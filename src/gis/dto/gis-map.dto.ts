import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GIS_MAP_CATEGORY_VALUES } from '../constants/gis-map-categories';

export class CreateGisMapDto {
  @ApiProperty({ example: 'Peta Pos Hidrologi Wilayah Sumatera Utara' })
  @IsString()
  @IsNotEmpty()
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
  description?: string;
}

export class UpdateGisMapDto {
  @ApiPropertyOptional({ example: 'Peta Pos Hidrologi Wilayah Sumatera Utara' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ enum: GIS_MAP_CATEGORY_VALUES })
  @IsOptional()
  @IsEnum(GIS_MAP_CATEGORY_VALUES)
  category?: string;

  @ApiPropertyOptional({ example: 'Peta titik pemantauan pos hidrologi' })
  @IsOptional()
  @IsString()
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
