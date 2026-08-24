import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User, UserRole, UserPermission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // ─── Basic CRUD ───────────────────────────────────────────

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
  }) {
    const { page = 1, limit = 10, search, isActive } = options || {};

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { organization: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          role: true,
          userRoles: {
            include: { role: true },
          },
          userPermissions: {
            include: { permission: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        userRoles: {
          include: { role: true },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        userRoles: {
          include: { role: true },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });
  }

  async create(data: Prisma.UserUncheckedCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data,
      include: {
        role: true,
        userRoles: {
          include: { role: true },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ─── Role Management ──────────────────────────────────────

  async findRoleByName(name: string) {
    return this.prisma.role.findFirst({
      where: { name: name as any },
    });
  }

  async findUserRoles(userId: string) {
    return this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }

  async assignRole(userId: string, roleId: string) {
    await this.findById(userId);

    // Validasi role benar-benar ada
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role tidak ditemukan');
    }

    // Cek apakah sudah punya role ini
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });

    if (existing) {
      return existing;
    }

    // Set primary roleId jika belum ada
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (!user.roleId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { roleId },
      });
    }

    return this.prisma.userRole.create({
      data: { userId, roleId },
      include: { role: true },
    });
  }

  async removeRole(userId: string, roleId: string) {
    await this.findById(userId);

    const userRole = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });

    if (!userRole) {
      throw new NotFoundException('User tidak memiliki role tersebut');
    }

    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });

    // Jika role yang dihapus adalah role primer, kosongkan roleId.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.roleId === roleId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { roleId: null },
      });
    }

    return { success: true };
  }

  // ─── Permission Management ────────────────────────────────

  async findUserPermissions(userId: string) {
    return this.prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    });
  }

  async assignPermission(userId: string, permissionId: string) {
    await this.findById(userId);

    // Validasi permission benar-benar ada
    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permission tidak ditemukan');
    }

    const existing = await this.prisma.userPermission.findUnique({
      where: { userId_permissionId: { userId, permissionId } },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.userPermission.create({
      data: { userId, permissionId },
      include: { permission: true },
    });
  }

  async removePermission(userId: string, permissionId: string) {
    await this.findById(userId);

    return this.prisma.userPermission.delete({
      where: { userId_permissionId: { userId, permissionId } },
    });
  }

  async syncPermissions(userId: string, permissionIds: string[]) {
    await this.findById(userId);

    // Hapus semua permission yang ada
    await this.prisma.userPermission.deleteMany({
      where: { userId },
    });

    // Assign permission baru
    if (permissionIds.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissionIds.map((permissionId) => ({
          userId,
          permissionId,
        })),
      });
    }

    return this.findUserPermissions(userId);
  }

  // ─── Utility ──────────────────────────────────────────────

  async findUserRole() {
    return this.prisma.role.findFirst({
      where: {
        name: 'USER',
      },
    });
  }
}
