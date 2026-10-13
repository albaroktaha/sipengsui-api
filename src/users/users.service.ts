import {
  BadRequestException,
  ConflictException,
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
import { PETUGAS_WORKFLOW_PERMISSION_SLUGS } from '../rekomtek/rekomtek-permission-policy';

const ROLE_PERMISSION_GRANTS: Partial<Record<RoleType, readonly string[]>> = {
  [RoleType.USER]: ['rekomtek.correct.initial', 'rekomtek.correct.post-expose'],
  [RoleType.PETUGAS_PETA]: [
    'gis.read',
    'gis.manage',
    'stations.read',
    'stations.create',
    'stations.update',
    'stations.delete',
    'master-data.read',
    'master-data.create',
    'master-data.update',
    'master-data.delete',
  ],
  [RoleType.PIMPINAN]: [
    'rekomtek.read',
    'rekomtek.workflow.read',
    'rekomtek.assign',
    'rekomtek.expose',
    'rekomtek.field',
    'rekomtek.artifact',
    'rekomtek.inspect',
    'rekomtek.publish.final',
  ],
  [RoleType.KEPALA_BIDANG]: [
    'rekomtek.read',
    'rekomtek.workflow.read',
    'rekomtek.approve.final',
  ],
  [RoleType.PETUGAS]: [
    ...PETUGAS_WORKFLOW_PERMISSION_SLUGS,
    'rekomtek.update',
    'rekomtek.delete',
  ],
};

const PETUGAS_RESTRICTED_PERMISSION_SLUGS = [
  'rekomtek.create',
  'rekomtek.submit',
  'rekomtek.correct.initial',
  'rekomtek.correct.post-expose',
  'disaster-reports.create',
] as const;

const PRIVILEGED_ROLE_NAMES = [
  'SUPER_ADMIN',
  'ADMIN',
  'PIMPINAN',
  'KEPALA_BIDANG',
] as const;

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
    roleId: string,
    roleName: RoleType,
  ): Promise<void> {
    const slugs = ROLE_PERMISSION_GRANTS[roleName];
    if (!slugs || slugs.length === 0) return;

    const permissions = await this.prisma.permission.findMany({
      where: { slug: { in: [...slugs] } },
      select: { id: true },
    });
    if (permissions.length === 0) return;

    const permissionIds = permissions.map(({ id }) => id);
    const currentGrants = await this.prisma.userPermission.findMany({
      where: { userId, permissionId: { in: permissionIds } },
      select: { permissionId: true, sourceRoleIds: true },
    });
    const currentByPermissionId = new Map(
      currentGrants.map((grant) => [grant.permissionId, grant]),
    );
    const newGrants = permissions.filter(
      ({ id }) => !currentByPermissionId.has(id),
    );

    if (newGrants.length > 0) {
      await this.prisma.userPermission.createMany({
        data: newGrants.map(({ id }) => ({
          userId,
          permissionId: id,
          manualGrant: false,
          sourceRoleIds: [roleId],
        })),
        skipDuplicates: true,
      });
    }

    for (const grant of currentGrants) {
      if (grant.sourceRoleIds.includes(roleId)) continue;
      await this.prisma.userPermission.update({
        where: {
          userId_permissionId: { userId, permissionId: grant.permissionId },
        },
        data: { sourceRoleIds: [...grant.sourceRoleIds, roleId] },
      });
    }
  }

  private async revokeRolePermissionSources(
    userId: string,
    roleId: string,
    client: Pick<Prisma.TransactionClient, 'userPermission'> = this.prisma,
  ): Promise<void> {
    const grants = await client.userPermission.findMany({
      where: { userId, sourceRoleIds: { has: roleId } },
      select: {
        permissionId: true,
        manualGrant: true,
        sourceRoleIds: true,
      },
    });

    for (const grant of grants) {
      const remainingRoleIds = grant.sourceRoleIds.filter(
        (sourceRoleId) => sourceRoleId !== roleId,
      );
      const where = {
        userId_permissionId: { userId, permissionId: grant.permissionId },
      };

      if (!grant.manualGrant && remainingRoleIds.length === 0) {
        await client.userPermission.delete({ where });
      } else {
        await client.userPermission.update({
          where,
          data: { sourceRoleIds: remainingRoleIds },
        });
      }
    }
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
      await this.prisma.$transaction(async (tx) => {
        if (user.role?.id) {
          await this.revokeRolePermissionSources(userId, user.role.id, tx);
          await tx.userRole.deleteMany({
            where: { userId, roleId: user.role.id },
          });
        }
        await tx.user.update({
          where: { id: userId },
          data: { roleId },
        });
      });
    }

    if (existing) {
      await this.grantRolePermissions(userId, roleId, role.name);
      if (this.isPetugasOnlyAccount(user, role.name)) {
        await this.revokePetugasRestrictedPermissions(userId);
      }
      return existing;
    }

    // Set primary roleId jika belum ada
    if (!user.roleId && !promotesFromUserRole) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { roleId },
      });
    }

    const userRole = await this.prisma.userRole.create({
      data: { userId, roleId },
      include: { role: true },
    });
    await this.grantRolePermissions(userId, roleId, role.name);
    if (this.isPetugasOnlyAccount(user, role.name)) {
      await this.revokePetugasRestrictedPermissions(userId);
    }
    return userRole;
  }

  async removeRole(userId: string, roleId: string) {
    await this.findById(userId);

    const userRole = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });

    if (!userRole) {
      throw new NotFoundException('User tidak memiliki role tersebut');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.revokeRolePermissionSources(userId, roleId, tx);
      await tx.userRole.delete({
        where: { userId_roleId: { userId, roleId } },
      });

      // Jika role yang dihapus adalah role primer, kosongkan roleId.
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user?.roleId === roleId) {
        await tx.user.update({
          where: { id: userId },
          data: { roleId: null },
        });
      }
    });

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
      if (!existing.manualGrant) {
        return this.prisma.userPermission.update({
          where: { userId_permissionId: { userId, permissionId } },
          data: { manualGrant: true },
          include: { permission: true },
        });
      }
      return existing;
    }

    return this.prisma.userPermission.create({
      data: { userId, permissionId, manualGrant: true },
      include: { permission: true },
    });
  }

  async removePermission(userId: string, permissionId: string) {
    await this.findById(userId);

    const existing = await this.prisma.userPermission.findUnique({
      where: { userId_permissionId: { userId, permissionId } },
      select: { sourceRoleIds: true },
    });
    if (existing?.sourceRoleIds.length) {
      throw new ConflictException(
        'Permission masih diberikan oleh role aktif. Hapus role sumber terlebih dahulu.',
      );
    }

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

    const uniquePermissionIds = [...new Set(permissionIds)];
    if (uniquePermissionIds.length > 0) {
      const existingPermissions = await this.prisma.permission.findMany({
        where: { id: { in: uniquePermissionIds } },
        select: { id: true },
      });
      if (existingPermissions.length !== uniquePermissionIds.length) {
        throw new BadRequestException(
          'Satu atau lebih permission tidak ditemukan.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const currentPermissions = await tx.userPermission.findMany({
        where: { userId },
        select: {
          permissionId: true,
          manualGrant: true,
          sourceRoleIds: true,
        },
      });
      const requestedIds = new Set(uniquePermissionIds);
      const inheritedRemovals = currentPermissions.filter(
        (current) =>
          current.sourceRoleIds.length > 0 &&
          !requestedIds.has(current.permissionId),
      );
      if (inheritedRemovals.length > 0) {
        throw new ConflictException(
          'Permission masih diberikan oleh role aktif. Hapus role sumber terlebih dahulu.',
        );
      }

      const currentIds = new Set(
        currentPermissions.map(({ permissionId }) => permissionId),
      );

      for (const current of currentPermissions) {
        if (requestedIds.has(current.permissionId)) {
          if (!current.manualGrant && current.sourceRoleIds.length === 0) {
            await tx.userPermission.update({
              where: {
                userId_permissionId: {
                  userId,
                  permissionId: current.permissionId,
                },
              },
              data: { manualGrant: true },
            });
          }
          continue;
        }

        await tx.userPermission.delete({
          where: {
            userId_permissionId: {
              userId,
              permissionId: current.permissionId,
            },
          },
        });
      }

      const newPermissionIds = uniquePermissionIds.filter(
        (id) => !currentIds.has(id),
      );
      if (newPermissionIds.length > 0) {
        await tx.userPermission.createMany({
          data: newPermissionIds.map((permissionId) => ({
            userId,
            permissionId,
            manualGrant: true,
          })),
          skipDuplicates: true,
        });
      }
    });

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
