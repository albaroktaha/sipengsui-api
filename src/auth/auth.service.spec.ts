import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService Turnstile enforcement', () => {
  const usersService = {
    findByEmail: jest.fn(),
    findUserRoles: jest.fn(),
    findUserPermissions: jest.fn(),
  };
  const prisma = {
    user: {
      update: jest.fn(),
    },
  };
  const jwtService = {
    signAsync: jest.fn(),
  };
  const emailVerificationService = {};
  const mailService = {};
  const turnstileService = {
    verify: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      usersService as never,
      prisma as never,
      jwtService as never,
      emailVerificationService as never,
      mailService as never,
      turnstileService as never,
    );
  });

  it('rejects login when Turnstile verification fails', async () => {
    turnstileService.verify.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'person@example.com',
        password: 'Password!1',
        captchaToken: 'invalid-token',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(usersService.findByEmail).not.toHaveBeenCalled();
  });

  it('continues login after Turnstile verification succeeds', async () => {
    turnstileService.verify.mockResolvedValue(true);
    usersService.findByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      name: 'Person',
      password: 'hashed-password',
      isActive: true,
      emailVerified: true,
      role: { name: 'USER' },
    });
    usersService.findUserRoles.mockResolvedValue([{ role: { name: 'USER' } }]);
    usersService.findUserPermissions.mockResolvedValue([
      { permission: { slug: 'dashboard.view' } },
    ]);
    prisma.user.update.mockResolvedValue({});
    jwtService.signAsync.mockResolvedValue('access-token');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      service.login({
        email: 'person@example.com',
        password: 'Password!1',
        captchaToken: 'valid-token',
      }),
    ).resolves.toMatchObject({ accessToken: 'access-token' });

    expect(turnstileService.verify).toHaveBeenCalledWith('valid-token');
    expect(usersService.findByEmail).toHaveBeenCalledWith('person@example.com');
    jest.restoreAllMocks();
  });
});

describe('AuthService self-service profile', () => {
  const usersService = {
    findByEmail: jest.fn(),
    findUserRoles: jest.fn(),
    findUserPermissions: jest.fn(),
  };
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
  };
  const emailVerificationService = {
    generateToken: jest.fn(),
  };
  const mailService = {
    sendVerificationEmail: jest.fn(),
  };
  const turnstileService = {
    verify: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      usersService as never,
      prisma as never,
      jwtService as never,
      emailVerificationService as never,
      mailService as never,
      turnstileService as never,
    );
  });

  it('normalizes profile data and sends email verification before committing an email change', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      firstName: 'Old',
      lastName: 'Name',
      email: 'old@example.com',
      password: 'hashed-password',
      phone: null,
      organization: null,
      address: null,
      pendingEmail: null,
      emailVerified: true,
      isActive: true,
      role: { id: 'role-id', name: 'USER' },
      userRoles: [],
      userPermissions: [],
    });
    usersService.findByEmail.mockResolvedValue(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    emailVerificationService.generateToken.mockReturnValue({
      token: 'verification-token',
      expiresAt: new Date('2026-08-21T00:00:00.000Z'),
    });
    mailService.sendVerificationEmail.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    let updatedData: Record<string, unknown> | undefined;
    const userUpdateMock = prisma.user.update as jest.MockedFunction<
      (args: { data?: Record<string, unknown> }) => Promise<unknown>
    >;
    userUpdateMock.mockImplementation(({ data }) => {
      updatedData = data;
      return Promise.resolve({});
    });
    prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.emailVerificationToken.create.mockResolvedValue({});

    const result = await (
      service as unknown as {
        updateProfile: (
          userId: string,
          dto: Record<string, string>,
        ) => Promise<unknown>;
      }
    ).updateProfile('user-id', {
      firstName: ' New ',
      lastName: ' Name ',
      email: ' New@Example.COM ',
      phone: '0812-3456-7890',
      organization: 'Example Org',
      address: 'Example Address',
      currentPassword: 'Current!1',
    });

    expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
      'new@example.com',
      'New Name',
      'verification-token',
      undefined,
      { strict: true, purpose: 'email-change' },
    );
    expect(updatedData).toMatchObject({
      firstName: 'New',
      lastName: 'Name',
      phone: '+6281234567890',
      organization: 'Example Org',
      address: 'Example Address',
      pendingEmail: 'new@example.com',
    });
    expect(result).toBeDefined();
  });

  it('rejects a password change when the new password matches the current password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      password: 'hashed-password',
      email: 'person@example.com',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      (
        service as unknown as {
          changePassword: (
            userId: string,
            dto: Record<string, string>,
          ) => Promise<unknown>;
        }
      ).changePassword('user-id', {
        currentPassword: 'Password!1',
        newPassword: 'Password!1',
        confirmPassword: 'Password!1',
      }),
    ).rejects.toThrow('Password baru harus berbeda dari password saat ini');
  });

  it('does not commit profile changes when email verification delivery fails', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      firstName: 'Old',
      lastName: 'Name',
      email: 'old@example.com',
      password: 'hashed-password',
      phone: null,
      organization: null,
      address: null,
      pendingEmail: null,
    });
    prisma.user.findFirst.mockResolvedValue(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    emailVerificationService.generateToken.mockReturnValue({
      token: 'verification-token',
      expiresAt: new Date('2026-08-21T00:00:00.000Z'),
    });
    mailService.sendVerificationEmail.mockRejectedValue(
      new Error('Email verifikasi gagal dikirim.'),
    );

    await expect(
      (
        service as unknown as {
          updateProfile: (
            userId: string,
            dto: Record<string, string>,
          ) => Promise<unknown>;
        }
      ).updateProfile('user-id', {
        firstName: 'New',
        lastName: 'Name',
        email: 'new@example.com',
        phone: '081234567890',
        organization: '',
        address: '',
        currentPassword: 'Current!1',
      }),
    ).rejects.toThrow('Email verifikasi gagal dikirim.');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows an OAuth user to create their first local password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'oauth-user-id',
      email: 'oauth@example.com',
      password: null,
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
    prisma.user.update.mockResolvedValue({});

    const result = await (
      service as unknown as {
        changePassword: (
          userId: string,
          dto: Record<string, string>,
        ) => Promise<{ message: string }>;
      }
    ).changePassword('oauth-user-id', {
      currentPassword: '',
      newPassword: 'NewPassword!1',
      confirmPassword: 'NewPassword!1',
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword!1', 10);
    expect(result.message).toBe('Password berhasil dibuat.');
  });

  it('allows an OAuth user to update profile data without a local password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'oauth-user-id',
      firstName: 'Old',
      lastName: 'Name',
      email: 'oauth@example.com',
      password: null,
      phone: null,
      organization: null,
      address: null,
      pendingEmail: null,
      emailVerified: true,
      isActive: true,
      avatar: null,
      role: { id: 'role-id', name: 'USER' },
      userRoles: [],
      userPermissions: [],
    });
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    prisma.user.update.mockResolvedValue({});
    jwtService.signAsync.mockResolvedValue('oauth-profile-token');
    const result = await (
      service as unknown as {
        updateProfile: (
          userId: string,
          dto: Record<string, string>,
        ) => Promise<unknown>;
      }
    ).updateProfile('oauth-user-id', {
      firstName: 'New',
      lastName: 'Name',
      email: 'oauth@example.com',
      phone: '',
      organization: 'Example Org',
      address: 'Example Address',
      currentPassword: '',
    });

    expect(result).toBeDefined();
    expect(prisma.user.update).toHaveBeenCalled();
  });
});

describe('AuthService registration role assignment', () => {
  const usersService = {
    findByEmail: jest.fn(),
    findRoleByName: jest.fn(),
    create: jest.fn(),
  };
  const prisma = {
    permission: {
      findMany: jest.fn(),
    },
    userPermission: {
      createMany: jest.fn(),
    },
    userRole: {
      create: jest.fn(),
    },
  };
  const jwtService = { signAsync: jest.fn() };
  const emailVerificationService = {
    generateToken: jest.fn(),
    persistToken: jest.fn(),
  };
  const mailService = { sendVerificationEmail: jest.fn() };
  const turnstileService = { verify: jest.fn() };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      usersService as never,
      prisma as never,
      jwtService as never,
      emailVerificationService as never,
      mailService as never,
      turnstileService as never,
    );
  });

  it('creates a USER role membership for a password registration', async () => {
    const userRole = { id: 'user-role-id', name: 'USER' };
    const createdUser = {
      id: 'new-user-id',
      firstName: 'New',
      lastName: 'User',
      email: 'new@example.com',
      password: 'hashed-password',
    };

    usersService.findByEmail.mockResolvedValue(null);
    usersService.findRoleByName.mockResolvedValue(userRole);
    usersService.create.mockResolvedValue(createdUser);
    prisma.permission.findMany.mockResolvedValue([]);
    prisma.userRole.create.mockResolvedValue({
      id: 'membership-id',
      userId: createdUser.id,
      roleId: userRole.id,
    });
    emailVerificationService.generateToken.mockReturnValue({
      token: 'verification-token',
      expiresAt: new Date('2026-08-27T00:00:00.000Z'),
    });
    emailVerificationService.persistToken.mockResolvedValue(undefined);
    mailService.sendVerificationEmail.mockResolvedValue(undefined);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

    await service.register({
      firstName: 'New',
      lastName: 'User',
      email: 'new@example.com',
      password: 'Password!1',
      termsAccepted: true,
    });

    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: { userId: createdUser.id, roleId: userRole.id },
    });
  });
});
