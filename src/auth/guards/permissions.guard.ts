import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Jika tidak ada @Permissions(), izinkan akses
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Akses ditolak: user tidak terautentikasi');
    }

    // Load permissions user dari database
    const userPermissions = await this.prisma.userPermission.findMany({
      where: { userId: user.userId },
      include: { permission: true },
    });

    const userPermissionSlugs = userPermissions.map((up) => up.permission.slug);

    // Superadmin dengan permission '*' bisa akses semua
    if (userPermissionSlugs.includes('*')) {
      return true;
    }

    // Cek apakah user memiliki SEMUA permission yang diperlukan (AND logic)
    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissionSlugs.includes(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Akses ditolak: memerlukan permission: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
