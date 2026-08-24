import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class GisMasterDataParentDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class GisMasterDataFeatureOverrideDto {
  @IsInt()
  index!: number;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  area?: number;

  @IsOptional()
  @IsNumber()
  length?: number;

  @IsOptional()
  @IsInt()
  orderNumber?: number;
}

export class ImportGisMasterDataDto extends GisMasterDataParentDto {
  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  featureIndexes?: number[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GisMasterDataFeatureOverrideDto)
  features?: GisMasterDataFeatureOverrideDto[];
}
