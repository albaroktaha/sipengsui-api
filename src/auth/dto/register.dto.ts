import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../decorators/is-strong-password.decorator';

export class RegisterDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  password!: string;

  @IsBoolean()
  @IsOptional()
  termsAccepted?: boolean;
}
