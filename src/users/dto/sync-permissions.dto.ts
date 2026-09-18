import { ArrayUnique, IsArray, IsString, Matches } from 'class-validator';

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SyncPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @Matches(UUID_FORMAT, { each: true })
  @ArrayUnique()
  permissionIds!: string[];
}
