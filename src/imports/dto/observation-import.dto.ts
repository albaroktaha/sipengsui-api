import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class ObservationImportDto {
  @ApiProperty()
  @IsNumber()
  row!: number;

  @ApiProperty({
    example: '2022-01-01T00:00:00.000Z',
  })
  @IsDateString()
  observationDate!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  rainfall?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  waterLevel?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  discharge?: number | null;

  @ApiPropertyOptional({
    type: [Object],
  })
  details?: {
    observationTime: string;
    waterLevel?: number;
    discharge?: number;
    note?: string;
  }[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observerName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiProperty()
  @IsBoolean()
  valid!: boolean;

  @ApiProperty({
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  errors!: string[];
}
