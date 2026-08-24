import { IsString, IsUUID } from 'class-validator';

export class AssignPermissionDto {
  @IsString()
  @IsUUID()
  permissionId!: string;
}
