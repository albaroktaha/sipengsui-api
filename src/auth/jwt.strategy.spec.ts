import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('refreshes roles and permissions from the database for a stale token', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          lastActivityAt: null,
          isActive: true,
          role: { name: 'PIMPINAN' },
          userRoles: [{ role: { name: 'PIMPINAN' } }],
          userPermissions: [{ permission: { slug: 'rekomtek.workflow.read' } }],
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const strategy = new JwtStrategy(prisma as never);

    await expect(
      strategy.validate({
        sub: 'official-1',
        email: 'official@example.com',
        role: 'USER',
        roles: [],
        permissions: ['rekomtek.read'],
      }),
    ).resolves.toMatchObject({
      role: 'PIMPINAN',
      roles: ['PIMPINAN'],
      permissions: ['rekomtek.workflow.read'],
    });
  });

  it('rejects a token for an inactive user', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          isActive: false,
          lastActivityAt: null,
          role: { name: 'USER' },
          userRoles: [],
          userPermissions: [],
        }),
      },
    };
    const strategy = new JwtStrategy(prisma as never);

    await expect(
      strategy.validate({
        sub: 'inactive-1',
        email: 'inactive@example.com',
        role: 'USER',
        roles: ['USER'],
        permissions: [],
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
