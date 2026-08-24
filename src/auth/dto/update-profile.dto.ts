import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform, type TransformFnParams } from 'class-transformer';

function trimValue({ value }: TransformFnParams): unknown {
  const input = value as unknown;
  return typeof input === 'string' ? input.trim() : input;
}

export class UpdateProfileDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @Transform(trimValue)
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @Transform(trimValue)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  organization?: string | null;

  @Transform(trimValue)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  address?: string | null;

  @IsString()
  @IsOptional()
  currentPassword?: string;
}
