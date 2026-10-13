import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { canManageDashboardNotifications } from './notifications-access';
import {
  CreateDashboardNotificationDto,
  DASHBOARD_NOTIFICATION_TARGET_ROLES,
  DashboardNotificationManagementQueryDto,
  DashboardNotificationTargetRole,
  UpdateDashboardNotificationDto,
} from './dashboard-notification.dto';

const INBOX_LIMIT = 100;
const MANAGEMENT_LIMIT = 100;

@Injectable()
export class DashboardNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInbox(user: AuthenticatedUser, unreadOnly = false) {
    const now = new Date();
    const workflowWhere = {
      recipientId: user.userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };
    const announcementWhere = {
      userId: user.userId,
      ...(unreadOnly ? { readAt: null } : {}),
      notification: {
        status: 'PUBLISHED' as const,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    };

    const [
      workflowItems,
      announcementRecipients,
      workflowUnread,
      announcementUnread,
    ] = await Promise.all([
      this.prisma.rekomtekNotification.findMany({
        where: workflowWhere,
        include: { rekomtek: { select: { nomor: true } } },
        orderBy: { createdAt: 'desc' },
        take: INBOX_LIMIT,
      }),
      this.prisma.dashboardNotificationRecipient.findMany({
        where: announcementWhere,
        include: {
          notification: {
            select: {
              id: true,
              title: true,
              message: true,
              severity: true,
              publishedAt: true,
              expiresAt: true,
            },
          },
        },
        orderBy: { deliveredAt: 'desc' },
        take: INBOX_LIMIT,
      }),
      this.prisma.rekomtekNotification.count({
        where: { recipientId: user.userId, readAt: null },
      }),
      this.prisma.dashboardNotificationRecipient.count({
        where: {
          userId: user.userId,
          readAt: null,
          notification: {
            status: 'PUBLISHED',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      }),
    ]);

    const items = [
      ...workflowItems.map((item) => ({
        id: item.id,
        kind: 'REKOMTEK_WORKFLOW' as const,
        title: item.title,
        message: item.message,
        severity: 'INFO' as const,
        createdAt: item.createdAt,
        readAt: item.readAt,
        href: `/dashboard/rekomtek/${item.rekomtekId}`,
        reference: item.rekomtek?.nomor ?? null,
      })),
      ...announcementRecipients.map((receipt) => ({
        id: receipt.notification.id,
        kind: 'ANNOUNCEMENT' as const,
        title: receipt.notification.title,
        message: receipt.notification.message,
        severity: receipt.notification.severity,
        createdAt: receipt.notification.publishedAt ?? receipt.deliveredAt,
        readAt: receipt.readAt,
        href: null,
        reference: null,
      })),
    ]
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      )
      .slice(0, INBOX_LIMIT);

    return { items, unreadCount: workflowUnread + announcementUnread };
  }

  async markRead(
    kind: string,
    notificationId: string,
    user: AuthenticatedUser,
  ) {
    const readAt = new Date();
    const result =
      kind === 'REKOMTEK_WORKFLOW'
        ? await this.prisma.rekomtekNotification.updateMany({
            where: {
              id: notificationId,
              recipientId: user.userId,
              readAt: null,
            },
            data: { readAt },
          })
        : kind === 'ANNOUNCEMENT'
          ? await this.prisma.dashboardNotificationRecipient.updateMany({
              where: {
                notificationId,
                userId: user.userId,
                readAt: null,
                notification: { status: 'PUBLISHED' },
              },
              data: { readAt },
            })
          : null;

    if (!result) throw new BadRequestException('Jenis notifikasi tidak valid');
    if (result.count !== 1)
      throw new NotFoundException('Notifikasi tidak ditemukan');
    return { id: notificationId, kind, readAt };
  }

  async markAllRead(user: AuthenticatedUser) {
    const readAt = new Date();
    const now = readAt;
    const [workflow, announcements] = await this.prisma.$transaction([
      this.prisma.rekomtekNotification.updateMany({
        where: { recipientId: user.userId, readAt: null },
        data: { readAt },
      }),
      this.prisma.dashboardNotificationRecipient.updateMany({
        where: {
          userId: user.userId,
          readAt: null,
          notification: {
            status: 'PUBLISHED',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
        data: { readAt },
      }),
    ]);
    return { markedRead: workflow.count + announcements.count };
  }

  async getManagedNotifications(
    user: AuthenticatedUser,
    query: DashboardNotificationManagementQueryDto = {},
  ) {
    this.assertCanManage(user);
    return this.prisma.dashboardNotification.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MANAGEMENT_LIMIT,
    });
  }

  async createNotification(
    input: CreateDashboardNotificationDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanManage(user);
    const targetRoles = [...new Set(input.targetRoles ?? [])];
    const status = input.status ?? 'DRAFT';
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    this.assertFutureExpiry(expiresAt, status === 'PUBLISHED');

    return this.prisma.$transaction(async (tx) => {
      const notification = await tx.dashboardNotification.create({
        data: {
          title: input.title.trim(),
          message: input.message.trim(),
          severity: input.severity ?? 'INFO',
          targetRoles,
          status,
          publishedAt: status === 'PUBLISHED' ? new Date() : null,
          expiresAt,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      if (status === 'PUBLISHED')
        await this.deliverToMatchingUsers(tx, notification.id, targetRoles);
      return this.getManagedRecord(tx, notification.id);
    });
  }

  async updateNotification(
    notificationId: string,
    input: UpdateDashboardNotificationDto,
    user: AuthenticatedUser,
  ) {
    this.assertCanManage(user);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.dashboardNotification.findUnique({
        where: { id: notificationId },
      });
      if (!current)
        throw new NotFoundException('Pemberitahuan tidak ditemukan');

      if (current.status === 'ARCHIVED')
        throw new ConflictException(
          'Pemberitahuan yang diarsipkan tidak dapat diubah',
        );

      if (current.status === 'PUBLISHED') {
        const hasContentChanges = Object.keys(input).some(
          (key) => key !== 'status',
        );
        if (input.status !== 'ARCHIVED' || hasContentChanges)
          throw new ConflictException(
            'Pemberitahuan terbit tidak dapat diedit; arsipkan lalu buat pemberitahuan baru',
          );
        await tx.dashboardNotification.update({
          where: { id: notificationId },
          data: { status: 'ARCHIVED', updatedById: user.userId },
        });
        return this.getManagedRecord(tx, notificationId);
      }

      const hasDraftChanges = Object.keys(input).length > 0;
      if (!hasDraftChanges)
        throw new BadRequestException('Tidak ada perubahan pemberitahuan');

      const status = input.status ?? current.status;
      const targetRoles =
        input.targetRoles ??
        current.targetRoles.filter(
          (role): role is DashboardNotificationTargetRole =>
            DASHBOARD_NOTIFICATION_TARGET_ROLES.includes(
              role as DashboardNotificationTargetRole,
            ),
        );
      const expiresAt =
        input.expiresAt === undefined
          ? current.expiresAt
          : input.expiresAt === null
            ? null
            : new Date(input.expiresAt);
      this.assertFutureExpiry(expiresAt, status === 'PUBLISHED');

      await tx.dashboardNotification.update({
        where: { id: notificationId },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.message !== undefined
            ? { message: input.message.trim() }
            : {}),
          ...(input.severity !== undefined ? { severity: input.severity } : {}),
          ...(input.targetRoles !== undefined ? { targetRoles } : {}),
          status,
          ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
          expiresAt,
          updatedById: user.userId,
        },
      });
      if (status === 'PUBLISHED')
        await this.deliverToMatchingUsers(tx, notificationId, targetRoles);
      return this.getManagedRecord(tx, notificationId);
    });
  }

  private assertCanManage(user: AuthenticatedUser): void {
    if (!canManageDashboardNotifications(user))
      throw new ForbiddenException(
        'Kelola pemberitahuan hanya untuk Kepala Seksi dan Super Admin',
      );
  }

  private assertFutureExpiry(expiresAt: Date | null, required: boolean): void {
    if (required && expiresAt && expiresAt.getTime() <= Date.now())
      throw new BadRequestException(
        'Waktu kedaluwarsa harus berada di masa depan',
      );
  }

  private async deliverToMatchingUsers(
    tx: Prisma.TransactionClient,
    notificationId: string,
    targetRoles: DashboardNotificationTargetRole[],
  ): Promise<void> {
    const roleNames = targetRoles as RoleType[];
    const users = await tx.user.findMany({
      where: {
        isActive: true,
        ...(roleNames.length
          ? {
              OR: [
                { role: { name: { in: roleNames } } },
                { userRoles: { some: { role: { name: { in: roleNames } } } } },
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    if (users.length === 0) return;

    await tx.dashboardNotificationRecipient.createMany({
      data: users.map(({ id }) => ({ notificationId, userId: id })),
      skipDuplicates: true,
    });
  }

  private getManagedRecord(
    tx: Prisma.TransactionClient,
    notificationId: string,
  ) {
    return tx.dashboardNotification.findUniqueOrThrow({
      where: { id: notificationId },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { recipients: true } },
      },
    });
  }
}
