import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

export const REKOMTEK_STAFF_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PETUGAS',
  'PIMPINAN',
] as const;

export function isRekomtekStaff(user: AuthenticatedUser): boolean {
  return user.roles?.some((role) =>
    REKOMTEK_STAFF_ROLES.includes(role as (typeof REKOMTEK_STAFF_ROLES)[number]),
  );
}

export function getPrimaryRole(user: AuthenticatedUser): string {
  return user.role || user.roles?.[0] || 'USER';
}
