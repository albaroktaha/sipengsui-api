import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { safeValidateUIMessages, type UIMessage } from 'ai';
import type { Request } from 'express';
import { ChatRequestSchema } from '../dto/chat-request.schema';
import { AiConfig } from '../ai.config';
import { InjectionDetectorService } from './injection-detector.service';
import { TopicPolicyService } from './topic-policy.service';
import type { PolicyDecision } from './policy.types';

const DEFAULT_BLOCK_MESSAGE =
  'Permintaan tersebut tidak dapat diproses. Asisten SIPENGSUI hanya dapat membantu informasi dan layanan resmi SIPENGSUI.';

const DEFAULT_REDIRECT_MESSAGE =
  'Saya hanya dapat membantu pertanyaan yang berkaitan dengan SIPENGSUI, layanan sumber daya air, data hidrologi, wilayah sungai, dan dokumentasi resmi yang tersedia.';

@Injectable()
export class InputPolicyService {
  private readonly logger = new Logger(InputPolicyService.name);

  constructor(
    private readonly config: AiConfig,
    private readonly injectionDetector: InjectionDetectorService,
    private readonly topicPolicy: TopicPolicyService,
  ) {}

  /**
   * Memvalidasi body request menjadi daftar UIMessage yang aman.
   * Fail closed: body invalid → BadRequestException.
   */
  async validateMessages(body: unknown): Promise<UIMessage[]> {
    const parsed = ChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Struktur request tidak valid.');
    }

    const rawMessages = parsed.data.messages;

    // Tolak role system dari client.
    for (const raw of rawMessages) {
      if (this.isRecord(raw) && raw.role === 'system') {
        throw new BadRequestException(
          'Role system tidak diizinkan dari client.',
        );
      }
    }

    // Validasi struktur UIMessage dengan AI SDK.
    const result = await safeValidateUIMessages({ messages: rawMessages });
    if (!result.success) {
      throw new BadRequestException('Struktur pesan tidak valid.');
    }

    const messages = result.data;

    // Batas panjang pesan user terakhir.
    const lastUserText = extractLastUserText(messages);
    if (lastUserText.length > this.config.maxInputChars) {
      throw new BadRequestException(
        `Pesan terlalu panjang. Maksimal ${this.config.maxInputChars} karakter.`,
      );
    }

    return messages;
  }

  /**
   * Mengevaluasi pertanyaan: deteksi injection, cek topik, cek kill switch.
   */
  evaluate(input: { question: string; request?: Request }): PolicyDecision {
    const { question } = input;

    if (!this.config.enabled) {
      return {
        allowed: false,
        safeMessage:
          'Fitur Asisten SIPENGSUI sedang dinonaktifkan. Silakan coba lagi nanti.',
        riskLevel: 'low',
        normalizedQuestion: question,
      };
    }

    if (!question) {
      return {
        allowed: false,
        safeMessage: DEFAULT_BLOCK_MESSAGE,
        riskLevel: 'low',
        normalizedQuestion: question,
      };
    }

    const normalized = normalizeQuestion(question);

    const injection = this.injectionDetector.analyze(normalized);
    if (injection.riskLevel === 'high') {
      this.logger.warn(
        `[AI] Prompt injection high risk. Categories: ${injection.matchedCategories.join(', ')}`,
      );
      return {
        allowed: false,
        safeMessage: injection.matchedCategories.some(
          (c) =>
            c.includes('secret') || c.includes('code') || c.includes('prompt'),
        )
          ? DEFAULT_BLOCK_MESSAGE
          : DEFAULT_BLOCK_MESSAGE,
        riskLevel: 'high',
        normalizedQuestion: normalized,
      };
    }

    const topic = this.topicPolicy.evaluate(normalized);
    if (!topic.allowed) {
      return {
        allowed: false,
        safeMessage: DEFAULT_REDIRECT_MESSAGE,
        riskLevel: injection.riskLevel === 'medium' ? 'medium' : 'low',
        normalizedQuestion: normalized,
      };
    }

    // Injection medium + topik diizinkan → tetap jalankan tapi catat.
    return {
      allowed: true,
      riskLevel: injection.riskLevel,
      normalizedQuestion: normalized,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}

/**
 * Mengambil hanya text part dari pesan user terakhir.
 */
export function extractLastUserText(messages: UIMessage[]): string {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user');

  if (!lastUserMessage) return '';

  return lastUserMessage.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

/** Normalisasi: trim, batasi repeated whitespace, pertahankan bahasa. */
function normalizeQuestion(question: string): string {
  return question
    .trim()
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}
