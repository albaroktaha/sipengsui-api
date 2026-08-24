import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { IsStrongPassword } from '../decorators/is-strong-password.decorator';

export class ChangePasswordDto {
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @IsString()
  @MinLength(8)
  @IsStrongPassword()
  newPassword!: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword!: string;
}
