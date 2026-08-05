import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Menentukan role yang diizinkan mengakses endpoint.
 * Contoh: @Roles('SUPER_ADMIN', 'ADMIN')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
