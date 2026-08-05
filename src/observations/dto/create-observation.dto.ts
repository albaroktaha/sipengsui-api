import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateObservationDto {
  @ApiProperty({
    description: 'ID Station',
  })
  @IsUUID()
  stationId!: string;

  @ApiProperty({
    description: 'Tanggal observasi',
    example: '2026-06-30T00:00:00.000Z',
  })
  @IsDateString()
  observationDate!: string;

  @ApiPropertyOptional({
    description: 'Curah hujan (mm)',
    example: 25.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  rainfall?: number;

  @ApiPropertyOptional({
    description: 'Tinggi muka air (m)',
    example: 2.35,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  waterLevel?: number;

  @ApiPropertyOptional({
    description: 'Debit (m³/s)',
    example: 18.75,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  discharge?: number;

  @ApiPropertyOptional({
    description: 'Catatan',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
