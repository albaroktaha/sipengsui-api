import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

export const REKOMTEK_STAFF_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PETUGAS',
  'PIMPINAN',
  'KEPALA_BIDANG',
] as const;

export function isRekomtekStaff(user: AuthenticatedUser): boolean {
  const roles = new Set([...(user.roles ?? []), user.role]);
  return [...roles].some((role) =>
    REKOMTEK_STAFF_ROLES.includes(
      role as (typeof REKOMTEK_STAFF_ROLES)[number],
    ),
  );
}

export function isPetugasOnly(user: AuthenticatedUser): boolean {
  const roles = new Set([...(user.roles ?? []), user.role]);
  return (
    roles.has('PETUGAS') &&
    !['SUPER_ADMIN', 'ADMIN', 'PIMPINAN', 'KEPALA_BIDANG'].some((role) =>
      roles.has(role),
    )
  );
}

export function getPrimaryRole(user: AuthenticatedUser): string {
  return user.role || user.roles?.[0] || 'USER';
}
