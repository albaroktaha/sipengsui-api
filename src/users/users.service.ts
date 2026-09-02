import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RoleType,
  User,
  WhatsAppConsentPurpose,
  WhatsAppConsentSource,
  WhatsAppIdentityStatus,
  WhatsAppOutboxStatus,
  WhatsAppPairingStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ROLE_PERMISSION_GRANTS: Partial<Record<RoleType, readonly string[]>> = {
  [RoleType.USER]: ['rekomtek.correct.initial', 'rekomtek.correct.post-expose'],
  [RoleType.PIMPINAN]: [
    'rekomtek.read',
    'rekomtek.workflow.read',
    'rekomtek.assign',
    'rekomtek.expose',
    'rekomtek.field',
    'rekomtek.artifact',
  ],
  [RoleType.PETUGAS]: [
    'rekomtek.read',
    'rekomtek.berkas',
    'rekomtek.evaluate',
    'rekomtek.workflow.read',
    'rekomtek.expose',
    'rekomtek.field',
    'rekomtek.artifact',
    'rekomtek.update',
    'rekomtek.delete',
  ],
};

const PETUGAS_RESTRICTED_PERMISSION_SLUGS = ['rekomtek.submit'] as const;

const PRIVILEGED_ROLE_NAMES = ['SUPER_ADMIN', 'ADMIN', 'PIMPINAN'] as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private isPetugasOnlyAccount(
    user: {
      role?: { name?: string | null } | null;
      userRoles?: Array<{ role: { name: string } }>;
    },
    additionalRole?: string,
  ): boolean {
    const roles = new Set<string>();
    if (user.role?.name) roles.add(user.role.name);
    for (const userRole of user.userRoles ?? []) {
      roles.add(userRole.role.name);
    }
    if (additionalRole) roles.add(additionalRole);
    return (
      roles.has('PETUGAS') &&
      !PRIVILEGED_ROLE_NAMES.some((role) => roles.has(role))
    );
  }

  private assertPetugasPermissionAllowed(
    user: Parameters<UsersService['isPetugasOnlyAccount']>[0],
    permissionSlug: string,
  ): void {
    if (
      this.isPetugasOnlyAccount(user) &&
      PETUGAS_RESTRICTED_PERMISSION_SLUGS.includes(
        permissionSlug as (typeof PETUGAS_RESTRICTED_PERMISSION_SLUGS)[number],
      )
    ) {
      throw new ForbiddenException(
        'Role PETUGAS tidak dapat memiliki permission untuk mengajukan Permohonan Rekomtek',
      );
    }
  }

  private async revokePetugasRestrictedPermissions(
    userId: string,
  ): Promise<void> {
    const permissions = await this.prisma.permission.findMany({
      where: { slug: { in: [...PETUGAS_RESTRICTED_PERMISSION_SLUGS] } },
      select: { id: true },
    });
    if (permissions.length === 0) return;
    await this.prisma.userPermission.deleteMany({
      where: {
        userId,
        permissionId: { in: permissions.map(({ id }) => id) },
      },
    });
  }

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

  private requestedActiveState(
    data: Prisma.UserUpdateInput,
  ): boolean | undefined {
    const value = data.isActive;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'object' && value !== null) {
      const setValue = (value as { set?: unknown }).set;
      return typeof setValue === 'boolean' ? setValue : undefined;
    }
    return undefined;
  }

  private async revokeWhatsAppState(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
    reason: 'USER_DEACTIVATED' | 'USER_REACTIVATION_RESET',
    actorUserId = userId,
  ): Promise<void> {
    const identities = await tx.whatsAppIdentity.findMany({
      where: { userId },
      select: { id: true },
    });
    const identityIds = identities.map(({ id: identityId }) => identityId);

    if (identityIds.length > 0) {
      await tx.whatsAppIdentity.updateMany({
        where: { id: { in: identityIds } },
        data: {
          userId: null,
          status: WhatsAppIdentityStatus.UNLINKED,
          verifiedAt: null,
          unlinkedAt: now,
        },
      });
      await tx.whatsAppIdentityAuditEvent.createMany({
        data: identityIds.map((identityId) => ({
          identityId,
          action:
            reason === 'USER_DEACTIVATED'
              ? 'DEACTIVATED'
              : 'REACTIVATION_RESET',
          actorUserId,
          metadata: { source: reason },
        })),
      });
      await tx.whatsAppConsent.updateMany({
        where: { identityId: { in: identityIds }, active: true },
        data: {
          active: false,
          optedOutAt: now,
          actorUserId,
        },
      });
      await tx.whatsAppConsentAuditEvent.createMany({
        data: identityIds.flatMap((identityId) =>
          [
            WhatsAppConsentPurpose.REKOMTEK_TRANSACTIONAL,
            WhatsAppConsentPurpose.SERVICE_CONVERSATION,
          ].map((purpose) => ({
            identityId,
            purpose,
            active: false,
            source: WhatsAppConsentSource.ADMIN,
            textVersion: reason,
            actorUserId,
          })),
        ),
      });
      await tx.whatsAppOutbox.updateMany({
        where: {
          recipientIdentityId: { in: identityIds },
          OR: [
            {
              status: {
                in: [WhatsAppOutboxStatus.PENDING, WhatsAppOutboxStatus.RETRY],
              },
            },
            {
              status: WhatsAppOutboxStatus.PROCESSING,
              sendStartedAt: null,
            },
          ],
        },
        data: {
          status: WhatsAppOutboxStatus.CANCELLED,
          leaseUntil: null,
          lockedBy: null,
          lastErrorCode: reason,
        },
      });
      await tx.whatsAppConversation.updateMany({
        where: { identityId: { in: identityIds } },
        data: { state: 'MENU', stateExpiresAt: null },
      });
    }

    await tx.whatsAppPairingCode.updateMany({
      where: { userId, status: WhatsAppPairingStatus.PENDING },
      data: { status: WhatsAppPairingStatus.REVOKED, revokedAt: now },
    });
  }

  private async updateWithWhatsAppLifecycle(
    id: string,
    data: Prisma.UserUpdateInput,
    isActive: boolean,
    reason: 'USER_DEACTIVATED' | 'USER_REACTIVATION_RESET',
    actorUserId = id,
  ) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { ...data, isActive },
        include: {
          role: true,
          userRoles: { include: { role: true } },
          userPermissions: { include: { permission: true } },
        },
      });
      await this.revokeWhatsAppState(tx, id, now, reason, actorUserId);
      return user;
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput, actorUserId?: string) {
    const current = await this.findById(id);
    const requestedActiveState = this.requestedActiveState(data);
    if (requestedActiveState === false) {
      return this.updateWithWhatsAppLifecycle(
        id,
        data,
        false,
        'USER_DEACTIVATED',
        actorUserId,
      );
    }
    if (requestedActiveState === true && !current.isActive) {
      return this.updateWithWhatsAppLifecycle(
        id,
        data,
        true,
        'USER_REACTIVATION_RESET',
        actorUserId,
      );
    }

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

  async remove(id: string, actorUserId?: string) {
    await this.findById(id);
    return this.updateWithWhatsAppLifecycle(
      id,
      { isActive: false },
      false,
      'USER_DEACTIVATED',
      actorUserId,
    );
  }

  // ─── Role Management ──────────────────────────────────────

  async findRoleByName(name: string) {
    return this.prisma.role.findFirst({
      where: { name: name as RoleType },
    });
  }

  async findUserRoles(userId: string) {
    return this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }

  private async grantRolePermissions(
    userId: string,
    roleName: RoleType,
  ): Promise<void> {
    const slugs = ROLE_PERMISSION_GRANTS[roleName];
    if (!slugs || slugs.length === 0) return;

    const permissions = await this.prisma.permission.findMany({
      where: { slug: { in: [...slugs] } },
      select: { id: true },
    });
    if (permissions.length === 0) return;

    await this.prisma.userPermission.createMany({
      data: permissions.map(({ id }) => ({ userId, permissionId: id })),
      skipDuplicates: true,
    });
  }

  async assignRole(userId: string, roleId: string) {
    const user = await this.findById(userId);

    // Validasi role benar-benar ada
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role tidak ditemukan');
    }

    // Cek apakah sudah punya role ini
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });

    const promotesFromUserRole =
      user.role?.name === 'USER' && role.name !== 'USER';
    if (promotesFromUserRole && user.roleId !== roleId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { roleId },
      });
      if (user.role?.id) {
        await this.prisma.userRole.deleteMany({
          where: { userId, roleId: user.role.id },
        });
      }
    }

    await this.grantRolePermissions(userId, role.name);
    if (this.isPetugasOnlyAccount(user, role.name)) {
      await this.revokePetugasRestrictedPermissions(userId);
    }

    if (existing) {
      return existing;
    }

    // Set primary roleId jika belum ada
    if (!user.roleId && !promotesFromUserRole) {
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

    const currentUser = await this.findById(userId);
    if (this.isPetugasOnlyAccount(currentUser)) {
      await this.revokePetugasRestrictedPermissions(userId);
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
    const user = await this.findById(userId);

    // Validasi permission benar-benar ada
    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permission tidak ditemukan');
    }
    this.assertPetugasPermissionAllowed(user, permission.slug);

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
    const user = await this.findById(userId);
    if (this.isPetugasOnlyAccount(user) && permissionIds.length > 0) {
      const restrictedPermissions = await this.prisma.permission.findMany({
        where: {
          id: { in: permissionIds },
          slug: { in: [...PETUGAS_RESTRICTED_PERMISSION_SLUGS] },
        },
        select: { slug: true },
      });
      if (restrictedPermissions.length > 0) {
        throw new ForbiddenException(
          'Role PETUGAS tidak dapat memiliki permission untuk mengajukan Permohonan Rekomtek',
        );
      }
    }

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
