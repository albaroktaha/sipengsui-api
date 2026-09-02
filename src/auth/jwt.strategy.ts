import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  roles: string[];
  permissions?: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload) {
    const timeoutMinutes = Number(
      process.env.SESSION_IDLE_TIMEOUT_MINUTES ?? 120,
    );

    // Cek batas waktu sesi idle (default 2 jam)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        isActive: true,
        lastActivityAt: true,
        role: { select: { name: true } },
        userRoles: { select: { role: { select: { name: true } } } },
        userPermissions: { select: { permission: { select: { slug: true } } } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Akun tidak aktif atau tidak ditemukan.');
    }

    if (user.lastActivityAt) {
      const idleMs = Date.now() - user.lastActivityAt.getTime();
      if (idleMs > timeoutMinutes * 60 * 1000) {
        throw new UnauthorizedException(
          'Sesi berakhir karena tidak ada aktivitas selama 2 jam. Silakan masuk kembali.',
        );
      }
    }

    // Update aktivitas (fire & forget — tidak memperlambat response).
    void this.prisma.user.update({
      where: { id: payload.sub },
      data: { lastActivityAt: new Date() },
    });

    const databaseRoles = user
      ? user.userRoles.map(({ role }) => String(role.name))
      : [];
    if (user?.role && !databaseRoles.includes(String(user.role.name))) {
      databaseRoles.unshift(String(user.role.name));
    }
    const databasePermissions =
      user?.userPermissions.map(({ permission }) => permission.slug) ?? [];

    return {
      userId: payload.sub,
      email: payload.email,
      role: databaseRoles[0] || payload.role,
      roles:
        databaseRoles.length > 0
          ? databaseRoles
          : payload.roles || (payload.role ? [payload.role] : []),
      permissions: user ? databasePermissions : payload.permissions || [],
    };
  }
}
