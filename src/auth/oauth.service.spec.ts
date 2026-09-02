import { OAuthService } from './oauth.service';

describe('OAuthService registration role assignment', () => {
  const prisma = {
    account: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const usersService = {
    findByEmail: jest.fn(),
    findRoleByName: jest.fn(),
  };
  const jwtService = { signAsync: jest.fn() };
  const emailVerificationService = {
    generateToken: jest.fn(),
    persistToken: jest.fn(),
  };
  const mailService = { sendVerificationEmail: jest.fn() };

  let service: OAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OAuthService(
      prisma as never,
      usersService as never,
      jwtService as never,
      emailVerificationService as never,
      mailService as never,
    );
  });

  it('creates a USER role membership for a new OAuth registration', async () => {
    const userRole = { id: 'user-role-id', name: 'USER' };
    const createdUser = {
      id: 'oauth-user-id',
      email: 'oauth@example.com',
      isActive: true,
      firstName: 'OAuth',
      lastName: 'User',
      phone: null,
      organization: null,
      address: null,
      avatar: null,
      emailVerified: false,
      role: userRole,
    };
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue(createdUser),
      },
      account: {
        create: jest.fn().mockResolvedValue({}),
      },
      userRole: {
        create: jest.fn().mockResolvedValue({}),
      },
      permission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userPermission: {
        createMany: jest.fn(),
      },
    };

    prisma.account.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );
    usersService.findByEmail.mockResolvedValue(null);
    usersService.findRoleByName.mockResolvedValue(userRole);
    emailVerificationService.generateToken.mockReturnValue({
      token: 'oauth-verification-token',
      expiresAt: new Date('2026-08-27T00:00:00.000Z'),
    });
    emailVerificationService.persistToken.mockResolvedValue(undefined);
    mailService.sendVerificationEmail.mockResolvedValue(undefined);

    await (
      service as unknown as {
        findOrCreateUser: (
          profile: {
            provider: 'google' | 'github';
            providerAccountId: string;
            email: string;
            name: string;
            avatar?: string;
          },
          termsAccepted: boolean,
        ) => Promise<unknown>;
      }
    ).findOrCreateUser(
      {
        provider: 'google',
        providerAccountId: 'provider-user-id',
        email: 'oauth@example.com',
        name: 'OAuth User',
      },
      true,
    );

    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: createdUser.id, roleId: userRole.id },
    });
  });
});
