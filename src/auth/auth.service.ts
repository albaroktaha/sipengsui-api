import {
  BadRequestException,
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { EmailVerificationService } from './email-verification.service';
import { MailService } from '../mail/mail.service';
import { ReCaptchaService } from '../recaptcha/recaptcha.service';

import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';

// Default permissions untuk user biasa — diberikan otomatis saat register
const DEFAULT_USER_PERMISSIONS = [
  'dashboard.view',
  'stations.read',
  'gis.read',
  'master-data.read',
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
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly mailService: MailService,
    private readonly recaptchaService: ReCaptchaService,
  ) {}

  private omitPassword<T extends { password: string }>(
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
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
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

    // Kirim email verifikasi
    const { token } = await this.emailVerificationService.createToken(user.id);
    await this.mailService.sendVerificationEmail(
      user.email,
      user.name,
      token,
    );

    return {
      message:
        'Register success. Silakan verifikasi email Anda untuk mengaktifkan akun.',
      data: this.omitPassword(user),
    };
  }

  async login(dto: LoginDto) {
    // Verifikasi captcha (anti-robot) sebelum proses login
    const captchaValid = await this.recaptchaService.verify(
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
        roles: roleNames,
        permissions: permissionSlugs,
      },
    };
  }

  async verifyEmail(token: string) {
    return this.emailVerificationService.verify(token);
  }

  async resendVerification(email: string) {
    return this.emailVerificationService.resend(email);
  }
}
