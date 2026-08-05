import { IsString, IsOptional, IsNumber, IsUUID } from 'class-validator';

export class CreateWatershedDto {
  @IsUUID()
  riverRegionId!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  area?: number;

  @IsOptional()
  geometry?: any;

  @IsOptional()
  @IsString()
  description?: string;
}
