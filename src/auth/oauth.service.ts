import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  formatUserDisplayName,
  splitExternalDisplayName,
} from '../users/user-name.util';
import { EmailVerificationService } from './email-verification.service';
import { MailService } from '../mail/mail.service';

interface ProviderProfile {
  provider: 'google' | 'github';
  providerAccountId: string;
  email: string;
  name: string;
  avatar?: string;
}

interface OAuthState {
  provider: 'google' | 'github';
  nonce: string;
  issuedAt: number;
  termsAccepted: boolean;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly mailService: MailService,
  ) {}

  getAuthorizationUrl(provider: 'google' | 'github', termsAccepted = false) {
    const config = this.getProviderConfig(provider);
    const state = this.signState({
      provider,
      nonce: randomBytes(16).toString('hex'),
      issuedAt: Date.now(),
      termsAccepted,
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      response_type: 'code',
      state,
    });

    if (provider === 'google') {
      params.set('scope', 'openid email profile');
      params.set('access_type', 'online');
      params.set('prompt', 'select_account');
      return {
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        state,
      };
    }

    params.set('scope', 'read:user user:email');
    return {
      url: `https://github.com/login/oauth/authorize?${params}`,
      state,
    };
  }

  async callback(provider: 'google' | 'github', code: string, state: string) {
    const parsedState = this.verifyState(state);
    if (parsedState.provider !== provider) {
      throw new BadRequestException('OAuth provider tidak sesuai.');
    }

    const profile =
      provider === 'google'
        ? await this.getGoogleProfile(code)
        : await this.getGithubProfile(code);

    if (profile.provider !== provider || !profile.email) {
      throw new UnauthorizedException(
        'Provider tidak memberikan email yang dapat diverifikasi.',
      );
    }

    const { user, verificationRequired } = await this.findOrCreateUser(
      profile,
      parsedState.termsAccepted,
    );
    if (!user.isActive) {
      throw new UnauthorizedException('Akun Anda telah dinonaktifkan');
    }

    if (verificationRequired) {
      return {
        verificationRequired: true,
        email: user.email,
      };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastActivityAt: new Date() },
    });

    const userRoles = await this.usersService.findUserRoles(user.id);
    const roleNames = userRoles.map((userRole) => userRole.role.name);
    const userPermissions = await this.usersService.findUserPermissions(
      user.id,
    );
    const permissionSlugs = userPermissions.map(
      (userPermission) => userPermission.permission.slug,
    );
    const primaryRole = roleNames[0] || user.role?.name || 'USER';
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: primaryRole,
      roles: roleNames,
      permissions: permissionSlugs,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: formatUserDisplayName(user.firstName, user.lastName),
        email: user.email,
        phone: user.phone,
        organization: user.organization,
        address: user.address,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        role: primaryRole,
        roles: roleNames,
        permissions: permissionSlugs,
        hasLocalPassword: false,
      },
    };
  }

  private async findOrCreateUser(
    profile: ProviderProfile,
    termsAccepted: boolean,
  ): Promise<{
    user: {
      id: string;
      email: string;
      isActive: boolean;
      firstName: string;
      lastName: string;
      phone: string | null;
      organization: string | null;
      address: string | null;
      avatar: string | null;
      emailVerified: boolean;
      role: { name: string } | null;
    };
    verificationRequired: boolean;
  }> {
    const linkedAccount = await this.prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: { include: { role: true } } },
    });

    if (linkedAccount) {
      if (!linkedAccount.user.emailVerified) {
        return { user: linkedAccount.user, verificationRequired: true };
      }
      return { user: linkedAccount.user, verificationRequired: false };
    }

    const existingUser = await this.usersService.findByEmail(profile.email);
    if (existingUser) {
      throw new UnauthorizedException(
        'Email sudah terdaftar. Masuk dengan password terlebih dahulu untuk menghubungkan akun provider.',
      );
    }

    if (!termsAccepted) {
      throw new BadRequestException(
        'Anda harus menyetujui Syarat & Ketentuan dan Kebijakan Privasi sebelum mendaftar dengan OAuth.',
      );
    }

    const userRole = await this.usersService.findRoleByName('USER');
    if (!userRole) {
      throw new InternalServerErrorException('Role USER tidak ditemukan.');
    }

    const nameParts = splitExternalDisplayName(profile.name);
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          firstName: nameParts.firstName || profile.email.split('@')[0],
          lastName: nameParts.lastName,
          email: profile.email,
          password: null,
          organization: null,
          address: null,
          avatar: profile.avatar,
          roleId: userRole.id,
          emailVerified: false,
          termsAcceptedAt: new Date(),
        },
        include: { role: true },
      });

      await tx.userRole.create({
        data: { userId: createdUser.id, roleId: userRole.id },
      });

      await tx.account.create({
        data: {
          userId: createdUser.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      });

      const permissions = await tx.permission.findMany({
        where: {
          slug: {
            in: [
              'dashboard.view',
              'rekomtek.read',
              'rekomtek.create',
              'rekomtek.update',
              'rekomtek.submit',
              'rekomtek.berkas',
              'disaster-reports.read',
              'disaster-reports.create',
            ],
          },
        },
      });

      if (permissions.length > 0) {
        await tx.userPermission.createMany({
          data: permissions.map((permission) => ({
            userId: createdUser.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }

      return createdUser;
    });

    const generatedToken = this.emailVerificationService.generateToken();
    await this.mailService.sendVerificationEmail(
      user.email,
      formatUserDisplayName(user.firstName, user.lastName),
      generatedToken.token,
      profile.provider,
      { strict: true, purpose: 'registration' },
    );
    await this.emailVerificationService.persistToken(user.id, generatedToken);

    return { user, verificationRequired: true };
  }

  private async getGoogleProfile(code: string): Promise<ProviderProfile> {
    const config = this.getProviderConfig('google');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedException('Login Google gagal.');
    }

    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new UnauthorizedException('Token Google tidak valid.');
    }

    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    if (!profileResponse.ok) {
      throw new UnauthorizedException('Profil Google tidak dapat dibaca.');
    }

    const profile = (await profileResponse.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      throw new UnauthorizedException(
        'Google hanya dapat digunakan dengan email yang sudah terverifikasi.',
      );
    }

    return {
      provider: 'google',
      providerAccountId: profile.sub,
      email: profile.email.toLowerCase(),
      name: profile.name || profile.email.split('@')[0],
      avatar: profile.picture,
    };
  }

  private async getGithubProfile(code: string): Promise<ProviderProfile> {
    const config = this.getProviderConfig('github');
    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: config.callbackUrl,
        }),
      },
    );

    if (!tokenResponse.ok) {
      throw new UnauthorizedException('Login GitHub gagal.');
    }

    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new UnauthorizedException('Token GitHub tidak valid.');
    }

    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token.access_token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Sipengsui',
    };
    const [userResponse, emailsResponse] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/emails', { headers }),
    ]);
    if (!userResponse.ok || !emailsResponse.ok) {
      throw new UnauthorizedException('Profil GitHub tidak dapat dibaca.');
    }

    const githubUser = (await userResponse.json()) as {
      id?: number;
      name?: string | null;
      login?: string;
      avatar_url?: string;
    };
    const emails = (await emailsResponse.json()) as Array<{
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }>;
    const verifiedEmail =
      emails.find(
        (email) => email.primary === true && email.verified === true,
      ) ?? emails.find((email) => email.verified === true);

    if (!githubUser.id || !verifiedEmail?.email) {
      throw new UnauthorizedException(
        'GitHub harus memiliki email yang sudah terverifikasi.',
      );
    }

    return {
      provider: 'github',
      providerAccountId: String(githubUser.id),
      email: verifiedEmail.email.toLowerCase(),
      name:
        githubUser.name ||
        githubUser.login ||
        verifiedEmail.email.split('@')[0],
      avatar: githubUser.avatar_url,
    };
  }

  private getProviderConfig(provider: 'google' | 'github') {
    const prefix = provider.toUpperCase();
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
    const callbackUrl = process.env[`${prefix}_CALLBACK_URL`];

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new InternalServerErrorException(
        `Login ${provider} belum dikonfigurasi di server.`,
      );
    }

    return { clientId, clientSecret, callbackUrl };
  }

  private signState(state: OAuthState) {
    const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
    const signature = createHmac('sha256', this.getStateSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyState(value: string): OAuthState {
    const [encoded, signature] = value.split('.');
    if (!encoded || !signature) {
      throw new BadRequestException('OAuth state tidak valid.');
    }

    const expected = createHmac('sha256', this.getStateSecret())
      .update(encoded)
      .digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new BadRequestException('OAuth state tidak valid.');
    }

    const state = JSON.parse(
      Buffer.from(encoded, 'base64url').toString(),
    ) as OAuthState;
    if (Date.now() - state.issuedAt > 10 * 60 * 1000) {
      throw new BadRequestException('OAuth state sudah kedaluwarsa.');
    }
    return state;
  }

  private getStateSecret() {
    return process.env.JWT_SECRET || 'development-oauth-state-secret';
  }
}
