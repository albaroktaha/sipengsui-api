import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const DASHBOARD_NOTIFICATION_SEVERITIES = [
  'INFO',
  'WARNING',
  'URGENT',
] as const;
export type DashboardNotificationSeverityInput =
  (typeof DASHBOARD_NOTIFICATION_SEVERITIES)[number];

export const DASHBOARD_NOTIFICATION_TARGET_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PETUGAS',
  'PETUGAS_PETA',
  'PIMPINAN',
  'USER',
] as const;
export type DashboardNotificationTargetRole =
  (typeof DASHBOARD_NOTIFICATION_TARGET_ROLES)[number];

export const DASHBOARD_NOTIFICATION_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export type DashboardNotificationStatusInput =
  (typeof DASHBOARD_NOTIFICATION_STATUSES)[number];

export class CreateDashboardNotificationDto {
  @ApiProperty({ example: 'Pemeliharaan sistem' })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @ApiProperty({
    example: 'Layanan tidak tersedia pada pukul 20.00–21.00 WIB.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @ApiProperty({ enum: DASHBOARD_NOTIFICATION_SEVERITIES, default: 'INFO' })
  @IsIn(DASHBOARD_NOTIFICATION_SEVERITIES)
  severity!: DashboardNotificationSeverityInput;

  @ApiPropertyOptional({
    enum: DASHBOARD_NOTIFICATION_TARGET_ROLES,
    isArray: true,
    description: 'Kosongkan untuk mengirim ke seluruh akun aktif',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(DASHBOARD_NOTIFICATION_TARGET_ROLES, { each: true })
  targetRoles?: DashboardNotificationTargetRole[];

  @ApiPropertyOptional({ enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';

  @ApiPropertyOptional({
    description: 'Waktu kedaluwarsa dalam ISO-8601; harus berada di masa depan',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateDashboardNotificationDto {
  @ApiPropertyOptional({ example: 'Pemeliharaan sistem' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({
    example: 'Layanan tidak tersedia pada pukul 20.00–21.00 WIB.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message?: string;

  @ApiPropertyOptional({ enum: DASHBOARD_NOTIFICATION_SEVERITIES })
  @IsOptional()
  @IsIn(DASHBOARD_NOTIFICATION_SEVERITIES)
  severity?: DashboardNotificationSeverityInput;

  @ApiPropertyOptional({
    enum: DASHBOARD_NOTIFICATION_TARGET_ROLES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(DASHBOARD_NOTIFICATION_TARGET_ROLES, { each: true })
  targetRoles?: DashboardNotificationTargetRole[];

  @ApiPropertyOptional({ enum: DASHBOARD_NOTIFICATION_STATUSES })
  @IsOptional()
  @IsIn(DASHBOARD_NOTIFICATION_STATUSES)
  status?: DashboardNotificationStatusInput;

  @ApiPropertyOptional({
    description: 'Waktu kedaluwarsa dalam ISO-8601; harus berada di masa depan',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class DashboardNotificationManagementQueryDto {
  @ApiPropertyOptional({ enum: DASHBOARD_NOTIFICATION_STATUSES })
  @IsOptional()
  @IsIn(DASHBOARD_NOTIFICATION_STATUSES)
  status?: DashboardNotificationStatusInput;
}
