import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

const OFFICIAL_NOTIFICATION_PERMISSIONS = [
  'rekomtek.inspect',
  'rekomtek.approve.final',
] as const;

export function canManageDashboardNotifications(
  user?: Pick<AuthenticatedUser, 'role' | 'roles' | 'permissions'> | null,
): boolean {
  if (!user) return false;

  const roles = new Set([user.role, ...(user.roles ?? [])]);
  if (roles.has('SUPER_ADMIN')) return true;
  if (!roles.has('PIMPINAN')) return false;

  const permissions = new Set(user.permissions ?? []);
  return OFFICIAL_NOTIFICATION_PERMISSIONS.some((permission) =>
    permissions.has(permission),
  );
}
