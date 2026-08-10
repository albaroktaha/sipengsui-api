import { Injectable, Logger } from '@nestjs/common';

interface SiteVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

@Injectable()
export class ReCaptchaService {
  private readonly logger = new Logger(ReCaptchaService.name);

  /**
   * Verifikasi token reCAPTCHA v2 ke Google.
   * Jika RECAPTCHA_SECRET_KEY kosong (mode dev), lewati verifikasi.
   */
  async verify(token: string): Promise<boolean> {
    const secret = process.env.RECAPTCHA_SECRET_KEY;

    if (!secret) {
      // Mode dev — tanpa secret key, captcha dilewati.
      return true;
    }

    if (!token) {
      return false;
    }

    try {
      const params = new URLSearchParams({
        secret,
        response: token,
      });

      const res = await fetch(
        `https://www.google.com/recaptcha/api/siteverify?${params.toString()}`,
        { method: 'POST' },
      );
      const data = (await res.json()) as SiteVerifyResponse;

      if (!data.success) {
        this.logger.warn(
          `reCAPTCHA verification failed: ${JSON.stringify(data['error-codes'])}`,
        );
      }

      return data.success === true;
    } catch (error) {
      this.logger.error('reCAPTCHA verify error', error as Error);
      return false;
    }
  }
}
