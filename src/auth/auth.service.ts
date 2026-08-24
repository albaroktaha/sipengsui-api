import {
  BadRequestException,
  Injectable,
  ConflictException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';

import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { formatUserDisplayName } from '../users/user-name.util';
import { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './email-verification.service';
import { MailService } from '../mail/mail.service';
import { TurnstileService } from '../turnstile/turnstile.service';

import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

export interface AuthProfileUser {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string | null;
  organization: string | null;
  address: string | null;
  pendingEmail: string | null;
  avatar: string | null;
  emailVerified: boolean;
  isActive: boolean;
  hasLocalPassword: boolean;
  role: { id: string; name: string } | null;
  roles: string[];
  permissions: string[];
}

export function normalizePhoneNumber(
  input: string | null | undefined,
): string | null {
  if (input === null || input === undefined || input.trim() === '') {
    return null;
  }

  const compact = input.trim().replace(/[\s-]/g, '');
  let digits: string;

  if (compact.startsWith('+62')) {
    digits = compact.slice(1);
  } else if (compact.startsWith('62')) {
    digits = compact;
  } else if (compact.startsWith('0')) {
    digits = `62${compact.slice(1)}`;
  } else {
    throw new BadRequestException(
      'Nomor telepon harus menggunakan format Indonesia.',
    );
  }

  if (!/^62[2-9]\d{7,12}$/.test(digits)) {
    throw new BadRequestException('Nomor telepon Indonesia tidak valid.');
  }

  return `+${digits}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isStrongPasswordValue(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

// Default permissions untuk user biasa — diberikan otomatis saat register
const DEFAULT_USER_PERMISSIONS = [
  'dashboard.view',
  'rekomtek.read',
  'rekomtek.create',
  'rekomtek.update',
  'rekomtek.submit',
  'rekomtek.berkas',
  'disaster-reports.read',
  'disaster-reports.create',
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly mailService: MailService,
    private readonly turnstileService: TurnstileService,
  ) {}

  private omitPassword<T extends { password: string | null }>(
    user: T,
  ): Omit<T, 'password'> {
    const { password: _password, ...rest } = user;

    void _password;

    return rest;
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    if (dto.termsAccepted !== true) {
      throw new BadRequestException(
        'Anda harus menyetujui Syarat & Ketentuan dan Kebijakan Privasi.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const userRole = await this.usersService.findRoleByName('USER');

    if (!userRole) {
      throw new Error('Role USER not found');
    }

    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      password: hashedPassword,
      organization: dto.organization?.trim() || null,
      address: dto.address?.trim() || null,
      roleId: userRole.id,
      emailVerified: false,
      termsAcceptedAt: new Date(),
    });

    // Auto-assign default USER permissions
    const permissionSlugs = DEFAULT_USER_PERMISSIONS;
    const permissions = await this.prisma.permission.findMany({
      where: { slug: { in: permissionSlugs } },
    });

    if (permissions.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissions.map((perm) => ({
          userId: user.id,
          permissionId: perm.id,
        })),
        skipDuplicates: true,
      });
    }

    // Kirim email verifikasi sebelum menyimpan token yang dikirimkan.
    const generatedToken = this.emailVerificationService.generateToken();
    await this.mailService.sendVerificationEmail(
      user.email,
      formatUserDisplayName(user.firstName, user.lastName),
      generatedToken.token,
      undefined,
      { strict: true, purpose: 'registration' },
    );
    await this.emailVerificationService.persistToken(user.id, generatedToken);

    return {
      message:
        'Register success. Silakan verifikasi email Anda untuk mengaktifkan akun.',
      data: this.omitPassword(user),
    };
  }

  async login(dto: LoginDto) {
    // Verifikasi Turnstile (anti-robot) sebelum proses login
    const captchaValid = await this.turnstileService.verify(
      dto.captchaToken ?? '',
    );

    if (!captchaValid) {
      throw new UnauthorizedException(
        'Verifikasi captcha gagal. Silakan coba lagi.',
      );
    }

    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Akun Anda telah dinonaktifkan');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'Akun ini menggunakan login Google atau GitHub. Silakan gunakan tombol login provider.',
      );
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Email belum diverifikasi. Silakan verifikasi terlebih dahulu.',
      );
    }

    // Catat waktu login & aktivitas terakhir
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastActivityAt: new Date() },
    });

    // Ambil semua roles user
    const userRoles = await this.usersService.findUserRoles(user.id);
    const roleNames = userRoles.map((ur) => ur.role.name);

    // Ambil semua permissions user
    const userPermissions = await this.usersService.findUserPermissions(
      user.id,
    );
    const permissionSlugs = userPermissions.map((up) => up.permission.slug);

    const primaryRole = roleNames[0] || user.role?.name || 'USER';

    const payload = {
      sub: user.id,
      email: user.email,
      role: primaryRole,
      roles: roleNames,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        ...this.omitPassword(user),
        displayName: formatUserDisplayName(user.firstName, user.lastName),
        roles: roleNames,
        permissions: permissionSlugs,
      },
    };
  }

  async verifyEmail(token: string) {
    const result = await this.emailVerificationService.verify(token);

    if (!result.emailChanged) {
      return { message: result.message };
    }

    const user = await this.loadProfileUser(result.userId);
    const accessToken = await this.issueAccessToken(user);

    return {
      message: result.message,
      accessToken,
      user,
    };
  }

  async resendVerification(email: string) {
    return this.emailVerificationService.resend(email);
  }

  async getProfile(userId: string): Promise<{ user: AuthProfileUser }> {
    return { user: await this.loadProfileUser(userId) };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    if (user.password) {
      if (
        !dto.currentPassword ||
        !(await bcrypt.compare(dto.currentPassword, user.password))
      ) {
        this.logSecurityEvent('profile_updated', userId, 'failed_password');
        throw new UnauthorizedException('Password saat ini salah');
      }
    }

    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException(
        'Nama depan dan nama belakang wajib diisi.',
      );
    }
    const displayName = formatUserDisplayName(firstName, lastName);
    const email = normalizeEmail(dto.email);
    const phone = normalizePhoneNumber(dto.phone);
    const organization = dto.organization?.trim() || null;
    const address = dto.address?.trim() || null;
    const currentEmail = normalizeEmail(user.email);
    const existingPendingEmail = user.pendingEmail
      ? normalizeEmail(user.pendingEmail)
      : null;
    const emailChangeRequested =
      email !== currentEmail && email !== existingPendingEmail;

    let generatedToken: { token: string; expiresAt: Date } | null = null;

    if (emailChangeRequested) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          id: { not: userId },
          OR: [
            { email: { equals: email, mode: 'insensitive' } },
            { pendingEmail: { equals: email, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });

      if (conflict) {
        this.logSecurityEvent(
          'profile_updated',
          userId,
          'failed_email_conflict',
        );
        throw new ConflictException('Email sudah digunakan');
      }

      generatedToken = this.emailVerificationService.generateToken();

      try {
        await this.mailService.sendVerificationEmail(
          email,
          displayName,
          generatedToken.token,
          undefined,
          { strict: true, purpose: 'email-change' },
        );
      } catch (error) {
        this.logSecurityEvent(
          'profile_email_change_requested',
          userId,
          'failed_delivery',
        );
        throw error;
      }
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          if (generatedToken) {
            const transactionConflict = await tx.user.findFirst({
              where: {
                id: { not: userId },
                OR: [
                  { email: { equals: email, mode: 'insensitive' } },
                  { pendingEmail: { equals: email, mode: 'insensitive' } },
                ],
              },
              select: { id: true },
            });

            if (transactionConflict) {
              throw new ConflictException('Email sudah digunakan');
            }

            await tx.emailVerificationToken.deleteMany({
              where: { userId, usedAt: null },
            });
            await tx.emailVerificationToken.create({
              data: {
                userId,
                token: generatedToken.token,
                expiresAt: generatedToken.expiresAt,
              },
            });
          }

          await tx.user.update({
            where: { id: userId },
            data: {
              firstName,
              lastName,
              phone,
              organization,
              address,
              ...(emailChangeRequested ? { pendingEmail: email } : {}),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code?: string }).code
          : undefined;
      if (code === 'P2002' || code === 'P2034') {
        throw new ConflictException('Email sudah digunakan');
      }
      throw error;
    }

    const profile = await this.loadProfileUser(userId);
    const accessToken = await this.issueAccessToken(profile);

    this.logSecurityEvent(
      emailChangeRequested
        ? 'profile_email_change_requested'
        : 'profile_updated',
      userId,
      'success',
    );

    return {
      message: emailChangeRequested
        ? 'Profil berhasil diperbarui. Tautan verifikasi telah dikirim ke email baru.'
        : 'Profil berhasil diperbarui.',
      accessToken,
      user: profile,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, password: true },
    });

    if (!user) {
      this.logSecurityEvent('password_changed', userId, 'failed_password');
      throw new UnauthorizedException('Password saat ini salah');
    }

    if (
      user.password &&
      (!dto.currentPassword ||
        !(await bcrypt.compare(dto.currentPassword, user.password)))
    ) {
      this.logSecurityEvent('password_changed', userId, 'failed_password');
      throw new UnauthorizedException('Password saat ini salah');
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Konfirmasi password tidak cocok');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'Password baru harus berbeda dari password saat ini',
      );
    }

    if (!isStrongPasswordValue(dto.newPassword)) {
      throw new BadRequestException(
        'Password minimal 8 karakter, mengandung 1 huruf besar, dan 1 karakter spesial',
      );
    }

    const password = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password },
    });

    const event = user.password ? 'password_changed' : 'password_created';
    this.logSecurityEvent(event, userId, 'success');
    return {
      message: user.password
        ? 'Password berhasil diubah.'
        : 'Password berhasil dibuat.',
    };
  }

  async resendPendingEmail(userId: string) {
    const result =
      await this.emailVerificationService.resendPendingEmail(userId);
    this.logSecurityEvent('profile_email_change_requested', userId, 'resent');
    return result;
  }

  async cancelPendingEmail(userId: string) {
    const result =
      await this.emailVerificationService.cancelPendingEmail(userId);
    this.logSecurityEvent(
      'profile_email_change_requested',
      userId,
      'cancelled',
    );
    return {
      ...result,
      ...(await this.getProfile(userId)),
    };
  }

  private async loadProfileUser(userId: string): Promise<AuthProfileUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        userRoles: { include: { role: true } },
        userPermissions: { include: { permission: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    const roles = user.userRoles.map(({ role }) => String(role.name));
    if (user.role && !roles.includes(String(user.role.name))) {
      roles.unshift(String(user.role.name));
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: formatUserDisplayName(user.firstName, user.lastName),
      email: user.email,
      phone: user.phone,
      organization: user.organization,
      address: user.address,
      pendingEmail: user.pendingEmail,
      avatar: user.avatar,
      emailVerified: user.emailVerified,
      isActive: user.isActive,
      hasLocalPassword: Boolean(user.password),
      role: user.role
        ? { id: user.role.id, name: String(user.role.name) }
        : null,
      roles,
      permissions: user.userPermissions.map(
        ({ permission }) => permission.slug,
      ),
    };
  }

  private async issueAccessToken(user: AuthProfileUser): Promise<string> {
    const primaryRole = user.roles[0] ?? user.role?.name ?? 'USER';
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: primaryRole,
      roles: user.roles,
    });
  }

  private logSecurityEvent(
    event: string,
    userId: string,
    result: string,
  ): void {
    this.logger.log(JSON.stringify({ event, userId, result }));
  }
}
