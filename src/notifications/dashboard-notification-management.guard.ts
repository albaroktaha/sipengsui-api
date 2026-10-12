import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { canManageDashboardNotifications } from './notifications-access';

@Injectable()
export class DashboardNotificationManagementGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    if (canManageDashboardNotifications(user)) return true;
    throw new ForbiddenException(
      'Kelola pemberitahuan hanya untuk Kepala Seksi, Kepala Bidang, dan Super Admin',
    );
  }
}
