import { Prisma } from '@prisma/client';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRiverDto {
  @IsUUID()
  watershedId!: string;

  @IsOptional()
  @IsUUID()
  parentRiverId?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  orderNumber?: number;

  @IsOptional()
  @IsNumber()
  length?: number;

  @IsOptional()
  geometry?: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  description?: string;
}
