import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  constructor() {
    const host = process.env.MAIL_HOST;

    if (!host) {
      // Mode dev — tanpa SMTP, email hanya di-log ke console.
      this.logger.warn(
        'MAIL_HOST tidak di-set. Email akan di-log ke console (mode dev).',
      );
      this.transporter = null;
    } else {
      this.transporter = createTransport({
        host,
        port: Number(process.env.MAIL_PORT ?? 587),
        secure: process.env.MAIL_SECURE === 'true',
        auth: process.env.MAIL_USER
          ? {
              user: process.env.MAIL_USER,
              pass: process.env.MAIL_PASS,
            }
          : undefined,
      });
    }
  }

  async sendMail({ to, subject, html }: SendMailOptions): Promise<void> {
    const from = process.env.MAIL_FROM ?? 'Sipengsui <noreply@sipengsui.id>';

    if (!this.transporter) {
      // Mode dev — log ke console.
      this.logger.log(`📧 [DEV] To: ${to} | Subject: ${subject}\n${html}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email terkirim ke ${to}: ${subject}`);
    } catch (error) {
      this.logger.error(`Gagal mengirim email ke ${to}`, error as Error);
    }
  }

  async sendVerificationEmail(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    const appUrl = process.env.APP_URL ?? 'http://localhost:3001';
    const verifyUrl = `${appUrl}/verify-email?token=${token}`;

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: #166534; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: bold;">S</div>
          <div>
            <div style="font-weight: bold; color: #111827;">Sipengsui</div>
            <div style="font-size: 12px; color: #6b7280;">Sistem Informasi Pengelolaan Sumber Daya Air</div>
          </div>
        </div>
        <h2 style="color: #111827; margin: 0 0 12px;">Verifikasi Email Anda</h2>
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">Halo <strong>${name}</strong>,</p>
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">
          Terima kasih telah mendaftar di Sipengsui. Untuk mengaktifkan akun Anda, silakan klik tombol di bawah ini untuk memverifikasi alamat email.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${verifyUrl}" style="display: inline-block; background: #166534; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: bold;">Verifikasi Email</a>
        </div>
        <p style="color: #6b7280; font-size: 12px; line-height: 1.6;">
          Jika tombol di atas tidak berfungsi, salin dan tempel tautan berikut ke browser Anda:<br/>
          <span style="color: #166534;">${verifyUrl}</span>
        </p>
        <p style="color: #6b7280; font-size: 12px; line-height: 1.6; margin-top: 20px;">
          Tautan ini berlaku selama 60 menit. Jika Anda tidak mendaftar di Sipengsui, abaikan email ini.
        </p>
      </div>
    `;

    await this.sendMail({
      to: email,
      subject: 'Verifikasi Email — Sipengsui',
      html,
    });
  }
}
