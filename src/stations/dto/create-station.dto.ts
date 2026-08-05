import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export enum StationType {
  ARR = 'ARR',
  AWLR = 'AWLR',
}

export class CreateStationDto {
  @ApiProperty({
    description: 'ID DAS',
    example: '550f9d86-80e0-4d93-bf76-d21c0d4f98f4',
  })
  @IsUUID()
  watershedId!: string;

  @ApiPropertyOptional({
    description: 'ID Sungai',
    example: 'aa0d9d86-80e0-4d93-bf76-d21c0d4f98f4',
  })
  @IsOptional()
  @IsUUID()
  riverId?: string;

  @ApiPropertyOptional({
    example: 'ARR-001',
    description: 'Kode Pos Hidrologi',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({
    example: 'Pos Curah Hujan Namo Bintang',
    description: 'Nama Pos Hidrologi',
  })
  @IsString()
  name!: string;

  @ApiProperty({
    enum: StationType,
    example: StationType.ARR,
  })
  @IsEnum(StationType)
  type!: StationType;

  @ApiPropertyOptional({
    example: 3.612345,
  })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({
    example: 98.612345,
  })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    example: 125.5,
    description: 'Elevasi (meter dpl)',
  })
  @IsOptional()
  @Min(-100)
  @Max(9000)
  elevation?: number;

  @ApiPropertyOptional({
    example: 'Budi Santoso',
    description: 'Nama Operator Pos',
  })
  @IsOptional()
  @IsString()
  operatorName?: string;

  @ApiPropertyOptional({
    example: 'Desa Namo Bintang',
  })
  @IsOptional()
  @IsString()
  village?: string;

  @ApiPropertyOptional({
    example: 'Pancur Batu',
  })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({
    example: 'Deli Serdang',
  })
  @IsOptional()
  @IsString()
  regency?: string;

  @ApiPropertyOptional({
    example: 2018,
  })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  installationYear?: number;

  @ApiPropertyOptional({
    example: 'Pos Curah Hujan milik BMKG',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  status?: boolean;
}
