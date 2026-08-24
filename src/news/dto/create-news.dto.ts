import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NewsStatus } from '@prisma/client';

export class CreateNewsDto {
  @ApiProperty({ example: 'Pembaruan data stasiun hidrologi' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title!: string;

  @ApiPropertyOptional({ example: 'pembaruan-data-stasiun-hidrologi' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  slug?: string;

  @ApiPropertyOptional({
    example: 'Ringkasan singkat untuk kartu berita dan metadata.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  excerpt?: string;

  @ApiProperty({ type: Object })
  @IsObject()
  contentJson!: Record<string, unknown>;

  @ApiProperty({ example: '<p>Isi berita...</p>' })
  @IsString()
  contentHtml!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ example: '/uploads/news/cover.webp' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string;

  @ApiPropertyOptional({
    example: 'Petugas memeriksa panel stasiun hidrologi.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  coverImageAlt?: string;

  @ApiPropertyOptional({ example: 'Pemantauan rutin stasiun hidrologi.' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  coverImageCaption?: string;

  @ApiPropertyOptional({
    example: 'Pembaruan Data Stasiun Hidrologi | Sipengsui',
  })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  seoTitle?: string;

  @ApiPropertyOptional({
    example: 'Informasi terbaru mengenai pembaruan data stasiun hidrologi.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string;

  @ApiPropertyOptional({
    example: 'https://sipengsui.sumutprov.go.id/berita/pembaruan-data',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  canonicalUrl?: string;

  @ApiPropertyOptional({ enum: NewsStatus, default: NewsStatus.DRAFT })
  @IsOptional()
  @IsEnum(NewsStatus)
  status?: NewsStatus;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ example: '2026-08-20T02:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateNewsDto extends PartialType(CreateNewsDto) {
  @ApiPropertyOptional({
    description: 'Simpan perubahan otomatis tanpa membuat versi baru.',
  })
  @IsOptional()
  @IsBoolean()
  autosave?: boolean;
}
