import { IsOptional, IsString } from 'class-validator';

export class CreateRiverRegionDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  name!: string;

  @IsOptional()
  geometry?: any;

  @IsOptional()
  @IsString()
  description?: string;
}
