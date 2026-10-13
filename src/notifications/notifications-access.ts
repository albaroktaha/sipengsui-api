import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

export function canManageDashboardNotifications(
  user?: Pick<AuthenticatedUser, 'role' | 'roles' | 'permissions'> | null,
): boolean {
  if (!user) return false;

  const roles = new Set([user.role, ...(user.roles ?? [])]);
  if (roles.has('SUPER_ADMIN')) return true;
  const permissions = new Set(user.permissions ?? []);
  return roles.has('PIMPINAN') && permissions.has('rekomtek.inspect');
}
