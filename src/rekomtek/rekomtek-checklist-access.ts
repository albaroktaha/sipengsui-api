import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

const KEPALA_SEKSI_PERMISSION = 'rekomtek.inspect';

/**
 * Technical role codes remain authoritative for authorization. The business
 * label Kepala Seksi is PIMPINAN with the document-inspection permission.
 */
export function canManageRekomtekChecklistTemplates(
  user?: Pick<AuthenticatedUser, 'role' | 'roles' | 'permissions'> | null,
): boolean {
  if (!user) return false;

  const roles = new Set([user.role, ...(user.roles ?? [])]);
  return (
    roles.has('SUPER_ADMIN') ||
    (roles.has('PIMPINAN') &&
      (user.permissions ?? []).includes(KEPALA_SEKSI_PERMISSION))
  );
}
