import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { canManageRekomtekChecklistTemplates } from '../rekomtek-checklist-access';

@Injectable()
export class ChecklistTemplateManagementGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    if (!canManageRekomtekChecklistTemplates(user)) {
      throw new ForbiddenException(
        'Hanya Super Admin atau Kepala Seksi yang dapat mengelola template checklist',
      );
    }
    return true;
  }
}
