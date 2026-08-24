import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Hidrologi' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'hidrologi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({
    example: 'Berita seputar data dan pemantauan hidrologi.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CreateTagDto {
  @ApiProperty({ example: 'Stasiun hidrologi' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ example: 'stasiun-hidrologi' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  slug?: string;
}

export class UpdateTagDto extends PartialType(CreateTagDto) {}

export class MergeTagDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetTagId!: string;
}

export class ScheduleNewsDto {
  @ApiProperty({ example: '2026-08-20T02:00:00.000Z' })
  @IsString()
  scheduledAt!: string;
}
