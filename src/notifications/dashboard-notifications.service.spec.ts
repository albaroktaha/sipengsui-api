import { ForbiddenException } from '@nestjs/common';
import { DashboardNotificationsService } from './dashboard-notifications.service';

const manager = {
  userId: 'manager-id',
  email: 'manager@example.test',
  role: 'PIMPINAN',
  roles: ['PIMPINAN'],
  permissions: ['rekomtek.inspect'],
};

function firstCallAsJson(mock: { mock: { calls: unknown[][] } }): string {
  return JSON.stringify(mock.mock.calls[0]?.[0] ?? null) ?? '';
}

describe('DashboardNotificationsService', () => {
  const tx = {
    user: { findMany: jest.fn() },
    dashboardNotification: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    dashboardNotificationRecipient: { createMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    dashboardNotification: { findMany: jest.fn() },
    dashboardNotificationRecipient: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    rekomtekNotification: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  let service: DashboardNotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.dashboardNotification.findUniqueOrThrow.mockResolvedValue({
      id: 'notice-id',
    });
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );
    service = new DashboardNotificationsService(prisma as never);
  });

  it('denies announcement management to a user without an official role permission', async () => {
    await expect(
      service.getManagedNotifications({
        ...manager,
        permissions: ['rekomtek.workflow.read'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.dashboardNotification.findMany).not.toHaveBeenCalled();
  });

  it('publishes an announcement to active users in the selected roles', async () => {
    tx.user.findMany.mockResolvedValue([{ id: 'head-id' }, { id: 'admin-id' }]);
    tx.dashboardNotification.create.mockResolvedValue({
      id: 'notice-id',
      title: 'Pemeliharaan sistem',
      message: 'Layanan akan dijeda sementara.',
      severity: 'WARNING',
      targetRoles: ['PIMPINAN', 'SUPER_ADMIN'],
      status: 'PUBLISHED',
      publishedAt: new Date('2026-09-29T08:00:00.000Z'),
    });
    tx.dashboardNotificationRecipient.createMany.mockResolvedValue({
      count: 2,
    });

    await service.createNotification(
      {
        title: 'Pemeliharaan sistem',
        message: 'Layanan akan dijeda sementara.',
        severity: 'WARNING',
        targetRoles: ['PIMPINAN', 'SUPER_ADMIN'],
        status: 'PUBLISHED',
      },
      manager,
    );

    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { role: { name: { in: ['PIMPINAN', 'SUPER_ADMIN'] } } },
          {
            userRoles: {
              some: { role: { name: { in: ['PIMPINAN', 'SUPER_ADMIN'] } } },
            },
          },
        ],
      },
      select: { id: true },
    });
    expect(tx.dashboardNotificationRecipient.createMany).toHaveBeenCalledWith({
      data: [
        { notificationId: 'notice-id', userId: 'head-id' },
        { notificationId: 'notice-id', userId: 'admin-id' },
      ],
      skipDuplicates: true,
    });
  });

  it('creates a draft without delivering it to inbox recipients', async () => {
    tx.dashboardNotification.create.mockResolvedValue({
      id: 'draft-id',
      title: 'Draf',
      message: 'Isi draf',
      severity: 'INFO',
      targetRoles: [],
      status: 'DRAFT',
      publishedAt: null,
    });

    await service.createNotification(
      { title: 'Draf', message: 'Isi draf', severity: 'INFO', targetRoles: [] },
      manager,
    );

    expect(tx.user.findMany).not.toHaveBeenCalled();
    expect(tx.dashboardNotificationRecipient.createMany).not.toHaveBeenCalled();
  });

  it('combines workflow and announcement items in the caller’s inbox', async () => {
    const workflowAt = new Date('2026-09-29T08:00:00.000Z');
    const announcementAt = new Date('2026-09-29T09:00:00.000Z');
    prisma.rekomtekNotification.findMany.mockResolvedValue([
      {
        id: 'workflow-id',
        title: 'Tahap permohonan berubah',
        message: 'Permohonan masuk tahap pemeriksaan.',
        createdAt: workflowAt,
        readAt: null,
        rekomtekId: 'rekomtek-id',
        rekomtek: { nomor: 'REK-2026-01' },
      },
    ]);
    prisma.dashboardNotificationRecipient.findMany.mockResolvedValue([
      {
        deliveredAt: announcementAt,
        readAt: null,
        notification: {
          id: 'announcement-id',
          title: 'Informasi layanan',
          message: 'Jam layanan berubah.',
          severity: 'WARNING',
          publishedAt: announcementAt,
          expiresAt: null,
        },
      },
    ]);
    prisma.rekomtekNotification.count.mockResolvedValue(2);
    prisma.dashboardNotificationRecipient.count.mockResolvedValue(3);

    const result = await service.getInbox({
      ...manager,
      userId: 'reader-id',
      roles: ['USER'],
      role: 'USER',
      permissions: [],
    });

    expect(prisma.rekomtekNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientId: 'reader-id' } }),
    );
    expect(
      firstCallAsJson(prisma.dashboardNotificationRecipient.findMany),
    ).toContain('"userId":"reader-id"');
    expect(result.unreadCount).toBe(5);
    expect(result.items.map((item) => item.kind)).toEqual([
      'ANNOUNCEMENT',
      'REKOMTEK_WORKFLOW',
    ]);
    expect(result.items[1]).toMatchObject({
      reference: 'REK-2026-01',
      href: '/dashboard/rekomtek/rekomtek-id',
    });
  });

  it('marks only the current user’s announcement receipt as read', async () => {
    prisma.dashboardNotificationRecipient.updateMany.mockResolvedValue({
      count: 1,
    });

    await service.markRead('ANNOUNCEMENT', 'announcement-id', {
      ...manager,
      userId: 'reader-id',
    });

    const query = firstCallAsJson(
      prisma.dashboardNotificationRecipient.updateMany,
    );
    expect(query).toContain('"userId":"reader-id"');
    expect(query).toContain('"notificationId":"announcement-id"');
  });

  it('does not reveal another user’s notification receipt', async () => {
    prisma.dashboardNotificationRecipient.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.markRead('ANNOUNCEMENT', 'not-recipient-notice', {
        ...manager,
        userId: 'reader-id',
      }),
    ).rejects.toThrow('Notifikasi tidak ditemukan');
  });
});
