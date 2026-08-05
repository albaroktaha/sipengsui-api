import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Menentukan permission yang diperlukan untuk mengakses endpoint.
 * Semua permission harus dimiliki user (AND logic).
 * Contoh: @Permissions('stations.read', 'stations.create')
 */
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
