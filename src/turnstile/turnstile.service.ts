import { Injectable, Logger } from '@nestjs/common';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  async verify(token: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;

    if (!secret || !token) {
      if (!secret) {
        this.logger.error('TURNSTILE_SECRET_KEY is not configured');
      }
      return false;
    }

    try {
      const body = new URLSearchParams({
        secret,
        response: token,
      }).toString();

      const response = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        },
      );

      if (!response.ok) {
        this.logger.warn(
          `Turnstile verification returned HTTP ${response.status}`,
        );
        return false;
      }

      const data = (await response.json()) as TurnstileVerifyResponse;

      if (!data.success) {
        this.logger.warn(
          `Turnstile verification failed: ${JSON.stringify(data['error-codes'] ?? [])}`,
        );
      }

      return data.success === true;
    } catch (error) {
      this.logger.error('Turnstile verification error', error as Error);
      return false;
    }
  }
}
