import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { formatUserDisplayName } from '../users/user-name.util';
import { MailService } from '../mail/mail.service';

export interface GeneratedVerificationToken {
  token: string;
  expiresAt: Date;
}

export interface EmailVerificationResult {
  message: string;
  userId: string;
  emailChanged: boolean;
}

type VerificationDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  private get tokenTtlMinutes(): number {
    return Number(process.env.VERIFY_TOKEN_TTL_MINUTES ?? 60);
  }

  private get resendCooldownMinutes(): number {
    return Number(process.env.VERIFY_RESEND_COOLDOWN_MINUTES ?? 5);
  }

  generateToken(): GeneratedVerificationToken {
    return {
      token: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + this.tokenTtlMinutes * 60 * 1000),
    };
  }

  async persistToken(
    userId: string,
    generated: GeneratedVerificationToken,
    db: VerificationDb = this.prisma,
  ): Promise<void> {
    await db.emailVerificationToken.deleteMany({
      where: { userId, usedAt: null },
    });

    await db.emailVerificationToken.create({
      data: {
        userId,
        token: generated.token,
        expiresAt: generated.expiresAt,
      },
    });
  }

  /**
   * Buat token verifikasi baru untuk user.
   * Batalkan token lama yang belum digunakan.
   */
  async createToken(userId: string): Promise<{ token: string; url: string }> {
    const generated = this.generateToken();
    await this.persistToken(userId, generated);

    const appUrl = process.env.APP_URL ?? 'http://localhost:3001';

    return {
      token: generated.token,
      url: `${appUrl}/verify-email?token=${generated.token}`,
    };
  }

  /**
   * Kirim ulang email verifikasi dengan cooldown (default 5 menit).
   */
  async resend(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email.trim().toLowerCase(),
          mode: 'insensitive',
        },
      },
      include: {
        role: true,
        userRoles: { include: { role: true } },
        userPermissions: { include: { permission: true } },
      },
    });

    if (!user) {
      // Jangan bocorkan keberadaan email — balas sukses untuk email tak dikenal.
      return {
        message:
          'Jika email terdaftar, tautan verifikasi telah dikirim ke email Anda.',
      };
    }

    if (user.emailVerified) {
      return {
        message: 'Email Anda sudah diverifikasi.',
      };
    }

    // Cooldown anti-spam: cek token valid terbaru yang dibuat < N menit lalu.
    const cooldownMs = this.resendCooldownMinutes * 60 * 1000;
    const recentToken = await this.prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - cooldownMs) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentToken) {
      const waitSeconds = Math.ceil(
        (recentToken.createdAt.getTime() + cooldownMs - Date.now()) / 1000,
      );
      const waitMinutes = Math.ceil(waitSeconds / 60);

      throw new HttpException(
        `Silakan tunggu ${waitMinutes} menit sebelum mengirim ulang email verifikasi.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const generated = this.generateToken();
    await this.mailService.sendVerificationEmail(
      user.email,
      formatUserDisplayName(user.firstName, user.lastName),
      generated.token,
      undefined,
      { strict: true, purpose: 'registration' },
    );
    await this.persistToken(user.id, generated);

    return {
      message:
        'Email verifikasi telah dikirim ulang. Silakan periksa kotak masuk Anda.',
    };
  }

  async resendPendingEmail(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    if (!user.pendingEmail) {
      throw new BadRequestException(
        'Tidak ada perubahan email yang menunggu verifikasi.',
      );
    }

    const cooldownMs = this.resendCooldownMinutes * 60 * 1000;
    const recentToken = await this.prisma.emailVerificationToken.findFirst({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - cooldownMs) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentToken) {
      const waitSeconds = Math.ceil(
        (recentToken.createdAt.getTime() + cooldownMs - Date.now()) / 1000,
      );
      throw new HttpException(
        `Silakan tunggu ${Math.ceil(waitSeconds / 60)} menit sebelum mengirim ulang email verifikasi.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const generated = this.generateToken();
    await this.mailService.sendVerificationEmail(
      user.pendingEmail,
      formatUserDisplayName(user.firstName, user.lastName),
      generated.token,
      undefined,
      { strict: true, purpose: 'email-change' },
    );
    await this.persistToken(userId, generated);

    return {
      message:
        'Email verifikasi telah dikirim ulang. Silakan periksa email baru Anda.',
    };
  }

  async cancelPendingEmail(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    if (!user.pendingEmail) {
      return { message: 'Tidak ada perubahan email yang perlu dibatalkan.' };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { pendingEmail: null },
      });
      await tx.emailVerificationToken.deleteMany({
        where: { userId, usedAt: null },
      });
    });

    return { message: 'Perubahan email berhasil dibatalkan.' };
  }

  /**
   * Verifikasi email berdasarkan token.
   */
  async verify(token: string): Promise<EmailVerificationResult> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!record || record.usedAt !== null) {
      throw new BadRequestException('Token tidak valid atau sudah digunakan.');
    }

    if (record.expiresAt < new Date()) {
      throw new BadRequestException(
        'Token verifikasi sudah kedaluwarsa. Silakan kirim ulang.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan.');
    }

    if (user.emailVerified && !user.pendingEmail) {
      throw new BadRequestException('Email sudah diverifikasi.');
    }

    const pendingEmail = user.pendingEmail?.trim().toLowerCase() ?? null;

    if (pendingEmail) {
      const conflict = await this.prisma.user.findFirst({
        where: {
          id: { not: user.id },
          email: { equals: pendingEmail, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (conflict) {
        throw new ConflictException('Email sudah digunakan.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          email: pendingEmail ?? user.email,
          pendingEmail: null,
          emailVerified: true,
        },
      });
      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      // Hapus token verifikasi lain milik user (tidak terpakai lagi).
      await tx.emailVerificationToken.deleteMany({
        where: { userId: user.id, id: { not: record.id } },
      });
    });

    if (pendingEmail) {
      this.logger.log(
        JSON.stringify({
          event: 'profile_email_change_verified',
          userId: user.id,
          result: 'success',
        }),
      );
    }

    return {
      message: pendingEmail
        ? 'Email baru berhasil diverifikasi dan diaktifkan.'
        : 'Email berhasil diverifikasi.',
      userId: user.id,
      emailChanged: Boolean(pendingEmail),
    };
  }
}
