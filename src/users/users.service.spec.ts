import { UsersService } from './users.service';

describe('UsersService role synchronization', () => {
  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      role: {
        findUnique: jest.fn(),
      },
      userRole: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      permission: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      userPermission: {
        findUnique: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    return { service: new UsersService(prisma as never), prisma };
  }

  it('promotes a USER primary role when PIMPINAN is assigned', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'user-role-id',
      role: { id: 'user-role-id', name: 'USER' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.role.findUnique.mockResolvedValue({
      id: 'pimpinan-role-id',
      name: 'PIMPINAN',
    });
    prisma.userRole.findUnique.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      roleId: 'pimpinan-role-id',
    });

    await service.assignRole('user-1', 'pimpinan-role-id');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { roleId: 'pimpinan-role-id' },
    });
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', roleId: 'user-role-id' },
    });
  });

  it('grants checklist review permissions when PETUGAS is assigned', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: null,
      role: null,
      userRoles: [],
      userPermissions: [],
    });
    prisma.role.findUnique.mockResolvedValue({
      id: 'petugas-role-id',
      name: 'PETUGAS',
    });
    prisma.userRole.findUnique.mockResolvedValue(null);
    prisma.permission.findMany.mockResolvedValue([
      { id: 'read-id', slug: 'rekomtek.read' },
      { id: 'berkas-id', slug: 'rekomtek.berkas' },
      { id: 'evaluate-id', slug: 'rekomtek.evaluate' },
      { id: 'workflow-read-id', slug: 'rekomtek.workflow.read' },
      { id: 'update-id', slug: 'rekomtek.update' },
      { id: 'delete-id', slug: 'rekomtek.delete' },
    ]);

    await service.assignRole('user-1', 'petugas-role-id');

    expect(prisma.userPermission.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', permissionId: 'read-id' },
        { userId: 'user-1', permissionId: 'berkas-id' },
        { userId: 'user-1', permissionId: 'evaluate-id' },
        { userId: 'user-1', permissionId: 'workflow-read-id' },
        { userId: 'user-1', permissionId: 'update-id' },
        { userId: 'user-1', permissionId: 'delete-id' },
      ],
      skipDuplicates: true,
    });
  });

  it('allows update permission assignment for Petugas-only users', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'petugas-role-id',
      role: { id: 'petugas-role-id', name: 'PETUGAS' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.permission.findUnique.mockResolvedValue({
      id: 'update-permission-id',
      slug: 'rekomtek.update',
    });

    await expect(
      service.assignPermission('user-1', 'update-permission-id'),
    ).resolves.toBeUndefined();
    expect(prisma.userPermission.create).toHaveBeenCalled();
  });

  it('rejects syncing application-management permissions for Petugas-only users', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'petugas-role-id',
      role: { id: 'petugas-role-id', name: 'PETUGAS' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.permission.findMany.mockResolvedValue([
      { id: 'submit-permission-id', slug: 'rekomtek.submit' },
    ]);

    await expect(
      service.syncPermissions('user-1', ['submit-permission-id']),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.userPermission.deleteMany).not.toHaveBeenCalled();
  });

  it('revokes stale submit permission when assigning PETUGAS', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'user-role-id',
      role: { id: 'user-role-id', name: 'USER' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.role.findUnique.mockResolvedValue({
      id: 'petugas-role-id',
      name: 'PETUGAS',
    });
    prisma.userRole.findUnique.mockResolvedValue(null);
    prisma.permission.findMany
      .mockResolvedValueOnce([
        { id: 'read-id', slug: 'rekomtek.read' },
        { id: 'berkas-id', slug: 'rekomtek.berkas' },
        { id: 'evaluate-id', slug: 'rekomtek.evaluate' },
        { id: 'workflow-read-id', slug: 'rekomtek.workflow.read' },
      ])
      .mockResolvedValueOnce([{ id: 'submit-id', slug: 'rekomtek.submit' }]);

    await service.assignRole('user-1', 'petugas-role-id');

    expect(prisma.userPermission.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        permissionId: { in: ['submit-id'] },
      },
    });
  });

  it('revokes WhatsApp identity, consent, outbox, pairing, and conversation on deactivation', async () => {
    const identityFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'wa-identity-1' }]);
    const identityUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const consentUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const outboxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const pairingUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const conversationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const userUpdate = jest.fn().mockResolvedValue({
      id: 'user-1',
      isActive: false,
    });
    const tx = {
      user: { update: userUpdate },
      whatsAppIdentity: {
        findMany: identityFindMany,
        updateMany: identityUpdateMany,
      },
      whatsAppIdentityAuditEvent: { createMany: jest.fn() },
      whatsAppConsent: { updateMany: consentUpdateMany },
      whatsAppConsentAuditEvent: { createMany: jest.fn() },
      whatsAppOutbox: { updateMany: outboxUpdateMany },
      whatsAppPairingCode: { updateMany: pairingUpdateMany },
      whatsAppConversation: { updateMany: conversationUpdateMany },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: userUpdate,
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback) => callback(tx)),
    };
    const service = new UsersService(prisma as never);

    await service.remove('user-1');

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { isActive: false },
      }),
    );
    expect(identityFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true },
    });
    expect(identityUpdateMany).toHaveBeenCalled();
    expect(consentUpdateMany).toHaveBeenCalled();
    expect(outboxUpdateMany).toHaveBeenCalled();
    expect(pairingUpdateMany).toHaveBeenCalled();
    expect(conversationUpdateMany).toHaveBeenCalled();
  });

  it('runs the same WhatsApp revocation when deactivation uses PATCH update', async () => {
    const identityFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 'wa-identity-1' }]);
    const identityUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const consentUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const outboxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const pairingUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const conversationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const userUpdate = jest.fn().mockResolvedValue({
      id: 'user-1',
      isActive: false,
    });
    const tx = {
      user: { update: userUpdate },
      whatsAppIdentity: {
        findMany: identityFindMany,
        updateMany: identityUpdateMany,
      },
      whatsAppIdentityAuditEvent: { createMany: jest.fn() },
      whatsAppConsent: { updateMany: consentUpdateMany },
      whatsAppConsentAuditEvent: { createMany: jest.fn() },
      whatsAppOutbox: { updateMany: outboxUpdateMany },
      whatsAppPairingCode: { updateMany: pairingUpdateMany },
      whatsAppConversation: { updateMany: conversationUpdateMany },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          isActive: true,
          role: null,
          userRoles: [],
          userPermissions: [],
        }),
        update: userUpdate,
      },
      $transaction: jest
        .fn()
        .mockImplementation((callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
    };
    const service = new UsersService(prisma as never);

    await service.update('user-1', { isActive: false });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(identityUpdateMany).toHaveBeenCalled();
    expect(consentUpdateMany).toHaveBeenCalled();
    expect(outboxUpdateMany).toHaveBeenCalled();
    expect(pairingUpdateMany).toHaveBeenCalled();
    expect(conversationUpdateMany).toHaveBeenCalled();
  });
});
