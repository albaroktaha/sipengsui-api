import { IsString, IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsString()
  @IsUUID()
  roleId!: string;
}
