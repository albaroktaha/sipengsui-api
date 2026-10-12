import { UsersService } from './users.service';

describe('UsersService role synchronization', () => {
  function createService() {
    const prisma = {
      $transaction: jest.fn(),
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
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof prisma) => unknown) => callback(prisma),
    );
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
    prisma.userPermission.findMany.mockResolvedValue([
      {
        permissionId: 'user-default-permission',
        manualGrant: false,
        sourceRoleIds: ['user-role-id'],
      },
    ]);

    await service.assignRole('user-1', 'pimpinan-role-id');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { roleId: 'pimpinan-role-id' },
    });
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', roleId: 'user-role-id' },
    });
    expect(prisma.userPermission.delete).toHaveBeenCalledWith({
      where: {
        userId_permissionId: {
          userId: 'user-1',
          permissionId: 'user-default-permission',
        },
      },
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
    const availablePermissions = [
      { id: 'read-id', slug: 'rekomtek.read' },
      { id: 'berkas-id', slug: 'rekomtek.berkas' },
      { id: 'evaluate-id', slug: 'rekomtek.evaluate' },
      { id: 'reject-id', slug: 'rekomtek.reject' },
      { id: 'workflow-read-id', slug: 'rekomtek.workflow.read' },
      { id: 'update-id', slug: 'rekomtek.update' },
      { id: 'delete-id', slug: 'rekomtek.delete' },
    ];
    prisma.permission.findMany.mockImplementation(
      (args: { where?: { slug?: { in?: string[] } } }) => {
        const requested = args.where?.slug?.in ?? [];
        return Promise.resolve(
          availablePermissions.filter(({ slug }) => requested.includes(slug)),
        );
      },
    );

    await service.assignRole('user-1', 'petugas-role-id');

    expect(prisma.userPermission.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          permissionId: 'read-id',
          manualGrant: false,
          sourceRoleIds: ['petugas-role-id'],
        },
        {
          userId: 'user-1',
          permissionId: 'berkas-id',
          manualGrant: false,
          sourceRoleIds: ['petugas-role-id'],
        },
        {
          userId: 'user-1',
          permissionId: 'evaluate-id',
          manualGrant: false,
          sourceRoleIds: ['petugas-role-id'],
        },
        {
          userId: 'user-1',
          permissionId: 'reject-id',
          manualGrant: false,
          sourceRoleIds: ['petugas-role-id'],
        },
        {
          userId: 'user-1',
          permissionId: 'workflow-read-id',
          manualGrant: false,
          sourceRoleIds: ['petugas-role-id'],
        },
        {
          userId: 'user-1',
          permissionId: 'update-id',
          manualGrant: false,
          sourceRoleIds: ['petugas-role-id'],
        },
        {
          userId: 'user-1',
          permissionId: 'delete-id',
          manualGrant: false,
          sourceRoleIds: ['petugas-role-id'],
        },
      ],
      skipDuplicates: true,
    });
  });

  it('grants GIS data management but not publication permission to PETUGAS_PETA', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: null,
      role: null,
      userRoles: [],
      userPermissions: [],
    });
    prisma.role.findUnique.mockResolvedValue({
      id: 'petugas-peta-role-id',
      name: 'PETUGAS_PETA',
    });
    prisma.userRole.findUnique.mockResolvedValue(null);
    const expectedSlugs = [
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
    ];
    const availablePermissions = [
      ...expectedSlugs.map((slug, index) => ({
        id: `permission-${index}`,
        slug,
      })),
      { id: 'gis-publish-id', slug: 'gis.publish' },
    ];
    prisma.permission.findMany.mockImplementation(
      (args: { where?: { slug?: { in?: string[] } } }) => {
        const requested = args.where?.slug?.in ?? [];
        return Promise.resolve(
          availablePermissions.filter(({ slug }) => requested.includes(slug)),
        );
      },
    );

    await service.assignRole('user-1', 'petugas-peta-role-id');

    expect(prisma.permission.findMany).toHaveBeenCalledWith({
      where: { slug: { in: expectedSlugs } },
      select: { id: true },
    });
    expect(prisma.userPermission.createMany).toHaveBeenCalledWith({
      data: expectedSlugs.map((_, index) => ({
        userId: 'user-1',
        permissionId: `permission-${index}`,
        manualGrant: false,
        sourceRoleIds: ['petugas-peta-role-id'],
      })),
      skipDuplicates: true,
    });
  });

  it('removes only the removed role grants and keeps manual or other-role grants', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'pimpinan-role-id',
      role: { id: 'pimpinan-role-id', name: 'PIMPINAN' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.userRole.findUnique.mockResolvedValue({
      id: 'membership-1',
      userId: 'user-1',
      roleId: 'pimpinan-role-id',
    });
    prisma.userPermission.findMany.mockResolvedValue([
      {
        permissionId: 'role-only-permission',
        manualGrant: false,
        sourceRoleIds: ['pimpinan-role-id'],
      },
      {
        permissionId: 'manual-permission',
        manualGrant: true,
        sourceRoleIds: ['pimpinan-role-id'],
      },
      {
        permissionId: 'shared-permission',
        manualGrant: false,
        sourceRoleIds: ['pimpinan-role-id', 'petugas-peta-role-id'],
      },
    ]);

    await service.removeRole('user-1', 'pimpinan-role-id');

    expect(prisma.userPermission.delete).toHaveBeenCalledWith({
      where: {
        userId_permissionId: {
          userId: 'user-1',
          permissionId: 'role-only-permission',
        },
      },
    });
    expect(prisma.userPermission.update).toHaveBeenNthCalledWith(1, {
      where: {
        userId_permissionId: {
          userId: 'user-1',
          permissionId: 'manual-permission',
        },
      },
      data: { sourceRoleIds: [] },
    });
    expect(prisma.userPermission.update).toHaveBeenNthCalledWith(2, {
      where: {
        userId_permissionId: {
          userId: 'user-1',
          permissionId: 'shared-permission',
        },
      },
      data: { sourceRoleIds: ['petugas-peta-role-id'] },
    });
  });

  it('keeps role grants inherited when syncing unrelated manual permissions', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'pimpinan-role-id',
      role: { id: 'pimpinan-role-id', name: 'PIMPINAN' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.userPermission.findMany.mockResolvedValueOnce([
      {
        permissionId: 'inherited-permission',
        manualGrant: false,
        sourceRoleIds: ['pimpinan-role-id'],
      },
      {
        permissionId: 'old-manual-permission',
        manualGrant: true,
        sourceRoleIds: [],
      },
    ]);
    prisma.permission.findMany.mockResolvedValue([
      { id: 'inherited-permission' },
      { id: 'new-manual-permission' },
    ]);

    await service.syncPermissions('user-1', [
      'inherited-permission',
      'new-manual-permission',
    ]);

    expect(prisma.userPermission.update).not.toHaveBeenCalled();
    expect(prisma.userPermission.delete).toHaveBeenCalledWith({
      where: {
        userId_permissionId: {
          userId: 'user-1',
          permissionId: 'old-manual-permission',
        },
      },
    });
    expect(prisma.userPermission.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          permissionId: 'new-manual-permission',
          manualGrant: true,
        },
      ],
      skipDuplicates: true,
    });
  });

  it('rejects removing a permission that is still inherited from an active role', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'pimpinan-role-id',
      role: { id: 'pimpinan-role-id', name: 'PIMPINAN' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.userPermission.findMany.mockResolvedValueOnce([
      {
        permissionId: 'inherited-permission',
        manualGrant: false,
        sourceRoleIds: ['pimpinan-role-id'],
      },
    ]);

    await expect(service.syncPermissions('user-1', [])).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.userPermission.delete).not.toHaveBeenCalled();
    expect(prisma.userPermission.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown permission before changing the current set', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      roleId: 'pimpinan-role-id',
      role: { id: 'pimpinan-role-id', name: 'PIMPINAN' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.permission.findMany.mockResolvedValue([]);

    await expect(
      service.syncPermissions('user-1', ['unknown-permission-id']),
    ).rejects.toMatchObject({ status: 400 });
    expect(prisma.userPermission.delete).not.toHaveBeenCalled();
    expect(prisma.userPermission.deleteMany).not.toHaveBeenCalled();
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
        .mockImplementation((callback: (client: typeof tx) => unknown) =>
          Promise.resolve(callback(tx)),
        ),
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
