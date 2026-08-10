import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class EmailVerificationService {
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

  /**
   * Buat token verifikasi baru untuk user.
   * Hapus token lama yang sudah kedaluwarsa.
   */
  async createToken(userId: string): Promise<{ token: string; url: string }> {
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.tokenTtlMinutes * 60 * 1000,
    );

    await this.prisma.emailVerificationToken.create({
      data: { userId, token, expiresAt },
    });

    const appUrl = process.env.APP_URL ?? 'http://localhost:3001';

    return { token, url: `${appUrl}/verify-email?token=${token}` };
  }

  /**
   * Kirim ulang email verifikasi dengan cooldown (default 5 menit).
   */
  async resend(email: string): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(email);

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

    const { token } = await this.createToken(user.id);
    await this.mailService.sendVerificationEmail(user.email, user.name, token);

    return {
      message:
        'Email verifikasi telah dikirim ulang. Silakan periksa kotak masuk Anda.',
    };
  }

  /**
   * Verifikasi email berdasarkan token.
   */
  async verify(token: string): Promise<{ message: string }> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!record || record.usedAt !== null) {
      throw new BadRequestException(
        'Token tidak valid atau sudah digunakan.',
      );
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

    if (user.emailVerified) {
      throw new BadRequestException('Email sudah diverifikasi.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Hapus token verifikasi lain milik user (tidak terpakai lagi).
      this.prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id, id: { not: record.id } },
      }),
    ]);

    return { message: 'Email berhasil diverifikasi.' };
  }
}
