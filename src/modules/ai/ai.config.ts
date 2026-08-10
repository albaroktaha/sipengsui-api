import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Konfigurasi terpusat untuk modul AI (Asisten SIPENGSUI).
 * Nilai dibaca dari environment dengan fallback ke default yang aman.
 */
@Injectable()
export class AiConfig {
  readonly enabled: boolean;
  readonly apiKey: string;
  readonly modelId: string;
  readonly maxInputChars: number;
  readonly maxHistoryMessages: number;
  readonly maxOutputTokens: number;
  readonly rateLimit: number;
  readonly rateTtlMs: number;
  readonly suggestions: string[];

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEMINI_API_KEY') ?? '';
    this.modelId = config.get<string>('GEMINI_MODEL') ?? 'gemini-3.5-flash';
    this.enabled = this.parseBoolean(
      config.get<string>('AI_CHAT_ENABLED'),
      true,
    );
    this.maxInputChars = this.parseInt(
      config.get<string>('AI_MAX_INPUT_CHARS'),
      4000,
    );
    this.maxHistoryMessages = this.parseInt(
      config.get<string>('AI_MAX_HISTORY_MESSAGES'),
      12,
    );
    this.maxOutputTokens = this.parseInt(
      config.get<string>('AI_MAX_OUTPUT_TOKENS'),
      900,
    );
    this.rateLimit = this.parseInt(config.get<string>('AI_RATE_LIMIT'), 10);
    this.rateTtlMs = this.parseInt(
      config.get<string>('AI_RATE_TTL_MS'),
      60_000,
    );
    this.suggestions = [
      'Apa itu SIPENGSUI?',
      'Apa saja fitur utamanya?',
      'Bagaimana melihat wilayah sungai?',
      'Bagaimana mengajukan permintaan data?',
      'Apa itu rekomendasi teknis?',
      'Bagaimana menggunakan dashboard?',
      'Bagaimana melaporkan bencana?',
      'Di mana informasi kontak?',
    ];
  }

  private parseInt(value: string | undefined, fallback: number): number {
    const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    return value.toLowerCase() === 'true';
  }
}
