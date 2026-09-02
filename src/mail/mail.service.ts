import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

interface SendMailBehavior {
  strict?: boolean;
}

type VerificationPurpose = 'registration' | 'email-change';

interface VerificationEmailOptions {
  strict?: boolean;
  purpose?: VerificationPurpose;
}

export interface RejectionLetterEmailData {
  email: string;
  applicantName: string;
  applicationNumber: string;
  applicationTitle: string;
  applicationUrl: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

export function buildRejectionLetterEmail(
  data: RejectionLetterEmailData,
): MailMessage {
  const safeName = escapeHtml(data.applicantName);
  const safeNumber = escapeHtml(data.applicationNumber);
  const safeTitle = escapeHtml(data.applicationTitle);
  const safeApplicationUrl = escapeHtml(data.applicationUrl);

  return {
    to: data.email,
    subject: `Surat Penolakan Permohonan Rekomtek ${data.applicationNumber} - SIPENGSUI`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
        <div style="margin-bottom: 20px;">
          <div style="font-size: 18px; font-weight: bold; color: #166534;">SIPENGSUI</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Sistem Informasi Pengelolaan Sumber Daya Air</div>
        </div>
        <h2 style="color: #111827; margin: 0 0 16px;">Surat Penolakan Permohonan Rekomtek</h2>
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">Yth. <strong>${safeName}</strong>,</p>
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">
          Permohonan Rekomtek nomor <strong>${safeNumber}</strong> dengan judul <strong>${safeTitle}</strong> telah ditolak setelah proses evaluasi ulang.
        </p>
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">
          Surat Penolakan final dapat dilihat dan diunduh melalui halaman detail permohonan Anda.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${safeApplicationUrl}" style="display: inline-block; background: #166534; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: bold;">Buka Detail Permohonan</a>
        </div>
        <p style="color: #6b7280; font-size: 12px; line-height: 1.6;">
          Jika tombol di atas tidak berfungsi, salin dan tempel tautan berikut ke browser Anda:<br/>
          <span style="color: #166534; word-break: break-all;">${safeApplicationUrl}</span>
        </p>
        <p style="color: #6b7280; font-size: 12px; line-height: 1.6; margin-top: 20px;">
          Email ini dikirim otomatis oleh SIPENGSUI. Silakan masuk ke akun Anda untuk mengunduh dokumen.
        </p>
      </div>
    `,
  };
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
        requireTLS: process.env.MAIL_REQUIRE_TLS === 'true',
        connectionTimeout: Number(
          process.env.MAIL_CONNECTION_TIMEOUT_MS ?? 10000,
        ),
        greetingTimeout: Number(process.env.MAIL_GREETING_TIMEOUT_MS ?? 10000),
        socketTimeout: Number(process.env.MAIL_SOCKET_TIMEOUT_MS ?? 10000),
        auth: process.env.MAIL_USER
          ? {
              user: process.env.MAIL_USER,
              pass: process.env.MAIL_PASS,
            }
          : undefined,
      });
    }
  }

  async sendMail(
    { to, subject, html }: SendMailOptions,
    behavior: SendMailBehavior = {},
  ): Promise<void> {
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
      if (behavior.strict) {
        throw new Error('Email verifikasi gagal dikirim.');
      }
    }
  }

  async sendVerificationEmail(
    email: string,
    name: string,
    token: string,
    provider?: 'google' | 'github',
    options: VerificationEmailOptions = {},
  ): Promise<void> {
    const appUrl = process.env.APP_URL ?? 'http://localhost:3001';
    const params = new URLSearchParams({ token, email });
    if (provider) params.set('provider', provider);
    const verifyUrl = `${appUrl}/verify-email?${params}`;

    const isEmailChange = options.purpose === 'email-change';
    const safeName = escapeHtml(name);
    const tokenTtlMinutes = Number(process.env.VERIFY_TOKEN_TTL_MINUTES ?? 60);
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: #166534; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: bold;">S</div>
          <div>
            <div style="font-weight: bold; color: #111827;">Sipengsui</div>
            <div style="font-size: 12px; color: #6b7280;">Sistem Informasi Pengelolaan Sumber Daya Air</div>
          </div>
        </div>
        <h2 style="color: #111827; margin: 0 0 12px;">${isEmailChange ? 'Konfirmasi Perubahan Email' : 'Verifikasi Email Anda'}</h2>
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">Halo <strong>${safeName}</strong>,</p>
        <p style="color: #374151; font-size: 14px; line-height: 1.6;">
          ${isEmailChange ? 'Gunakan tombol di bawah ini untuk mengonfirmasi perubahan alamat email akun Sipengsui Anda.' : 'Terima kasih telah mendaftar di Sipengsui. Untuk mengaktifkan akun Anda, silakan klik tombol di bawah ini untuk memverifikasi alamat email.'}
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${verifyUrl}" style="display: inline-block; background: #166534; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: bold;">Verifikasi Email</a>
        </div>
        <p style="color: #6b7280; font-size: 12px; line-height: 1.6;">
          Jika tombol di atas tidak berfungsi, salin dan tempel tautan berikut ke browser Anda:<br/>
          <span style="color: #166534;">${verifyUrl}</span>
        </p>
        <p style="color: #6b7280; font-size: 12px; line-height: 1.6; margin-top: 20px;">
          Tautan ini berlaku selama ${tokenTtlMinutes} menit. Jika Anda tidak mendaftar di Sipengsui, abaikan email ini.
        </p>
      </div>
    `;

    await this.sendMail(
      {
        to: email,
        subject: `${isEmailChange ? 'Konfirmasi Perubahan Email' : 'Verifikasi Email'} — Sipengsui`,
        html,
      },
      { strict: options.strict },
    );
  }

  async sendRejectionLetterEmail(
    data: RejectionLetterEmailData,
  ): Promise<void> {
    await this.sendMail(buildRejectionLetterEmail(data));
  }
}
