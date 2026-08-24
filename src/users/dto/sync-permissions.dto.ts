import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SyncPermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  permissionIds!: string[];
}
