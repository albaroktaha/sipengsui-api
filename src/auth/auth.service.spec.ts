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
