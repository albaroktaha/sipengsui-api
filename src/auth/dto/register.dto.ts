import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../decorators/is-strong-password.decorator';

function trimValue({ value }: TransformFnParams): unknown {
  const input = value as unknown;
  return typeof input === 'string' ? input.trim() : input;
}

export class RegisterDto {
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
  @MinLength(8)
  @IsStrongPassword()
  password!: string;

  @IsBoolean()
  @IsOptional()
  termsAccepted?: boolean;
}
