import { Injectable, Logger } from '@nestjs/common';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AiConfig } from '../ai.config';

/**
 * Provider Gemini — dibuat satu kali saat startup.
 * API key hanya dibaca dari environment server, tidak pernah dikirim ke browser.
 */
@Injectable()
export class GeminiProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: ReturnType<typeof createGoogleGenerativeAI>;
  readonly modelId: string;

  constructor(config: AiConfig) {
    if (!config.apiKey) {
      this.logger.warn(
        'GEMINI_API_KEY tidak dikonfigurasi. Chatbot akan menolak permintaan Gemini.',
      );
    }
    this.modelId = config.modelId;
    this.client = createGoogleGenerativeAI({
      apiKey: config.apiKey,
    });
  }

  /** Mengembalikan model Gemini sesuai konfigurasi environment. */
  model() {
    return this.client(this.modelId);
  }
}
