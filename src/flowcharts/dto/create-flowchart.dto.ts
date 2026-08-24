import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class FlowNodePositionDto {
  @ApiProperty({ description: 'Posisi horizontal pada canvas', example: 120 })
  @IsNumber()
  x!: number;

  @ApiProperty({ description: 'Posisi vertikal pada canvas', example: 240 })
  @IsNumber()
  y!: number;
}

export class FlowNodeDto {
  @ApiProperty({ description: 'ID unik node', example: 'A' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  id!: string;

  @ApiProperty({ description: 'Teks pada node', example: 'Pemohon Rekomtek' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  label!: string;

  @ApiProperty({
    description: 'Bentuk node',
    enum: ['process', 'decision', 'start_end', 'document'],
    example: 'process',
  })
  @IsString()
  @IsIn(['process', 'decision', 'start_end', 'document'])
  type!: 'process' | 'decision' | 'start_end' | 'document';

  @ApiPropertyOptional({
    description: 'Warna latar node (hex)',
    example: '#d8f3dc',
  })
  @IsOptional()
  @IsHexColor()
  fill?: string;

  @ApiPropertyOptional({
    description: 'Warna garis node (hex)',
    example: '#2d6a4f',
  })
  @IsOptional()
  @IsHexColor()
  stroke?: string;

  @ApiPropertyOptional({
    description: 'Warna teks node (hex)',
    example: '#1b4332',
  })
  @IsOptional()
  @IsHexColor()
  textColor?: string;

  @ApiPropertyOptional({
    description: 'Posisi node pada canvas editor',
    type: FlowNodePositionDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FlowNodePositionDto)
  position?: FlowNodePositionDto;
}

export class FlowEdgeDto {
  @ApiProperty({ description: 'ID unik edge', example: 'e1' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  id!: string;

  @ApiProperty({ description: 'ID node asal', example: 'A' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  source!: string;

  @ApiProperty({ description: 'ID node tujuan', example: 'B' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  target!: string;

  @ApiPropertyOptional({
    description: 'Handle asal untuk menjaga arah routing panah',
    example: 'source-right',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceHandle?: string;

  @ApiPropertyOptional({
    description: 'Handle tujuan untuk menjaga arah routing panah',
    example: 'target-left',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  targetHandle?: string;

  @ApiPropertyOptional({
    description: 'Label pada panah (mis. durasi)',
    example: '1 Hari Kerja',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({
    description: 'Animasi panah mengalir',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  animated?: boolean;
}

export class CreateFlowchartDto {
  @ApiProperty({
    description: 'Slug unik untuk akses publik',
    example: 'rekomtek',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug hanya boleh berisi huruf kecil, angka, dan tanda hubung',
  })
  @MinLength(3)
  @MaxLength(80)
  slug!: string;

  @ApiProperty({
    description: 'Judul flowchart',
    example: 'Alur Pengajuan Rekomendasi Teknis (Rekomtek)',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({
    description: 'Deskripsi flowchart',
    example:
      'Visualisasi interaktif untuk pelacakan proses standar operasional.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Status publikasi',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({
    description: 'Daftar node (format React Flow, tanpa posisi)',
    type: [FlowNodeDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowNodeDto)
  nodes?: FlowNodeDto[];

  @ApiPropertyOptional({
    description: 'Daftar edge (panah)',
    type: [FlowEdgeDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowEdgeDto)
  edges?: FlowEdgeDto[];
}
