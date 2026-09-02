import { Injectable, Logger } from '@nestjs/common';
import {
  convertToModelMessages,
  generateText,
  streamText,
  type UIMessageChunk,
} from 'ai';
import type { GoogleGenerativeAIProviderOptions } from '@ai-sdk/google';
import type { Request } from 'express';
import { AiConfig } from './ai.config';
import { GeminiProvider } from './gemini/gemini.provider';
import {
  InputPolicyService,
  extractLastUserText,
} from './guardrails/input-policy.service';
import { OutputPolicyService } from './guardrails/output-policy.service';
import { StaticKnowledgeService } from './knowledge/static-knowledge.service';
import { PrismaKnowledgeService } from './knowledge/prisma-knowledge.service';
import type { KnowledgeChunk } from './knowledge/knowledge.types';
import { buildSipengsuiSystemPrompt } from './prompts/sipengsui-system-prompt';
import { AiAuditService } from './logging/ai-audit.service';

const GOOGLE_SAFETY_SETTINGS = {
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
} satisfies GoogleGenerativeAIProviderOptions;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: AiConfig,
    private readonly gemini: GeminiProvider,
    private readonly inputPolicy: InputPolicyService,
    private readonly outputPolicy: OutputPolicyService,
    private readonly staticKnowledge: StaticKnowledgeService,
    private readonly prismaKnowledge: PrismaKnowledgeService,
    private readonly audit: AiAuditService,
  ) {}

  async createChatStream(input: {
    body: unknown;
    request: Request;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const startedAt = Date.now();

    if (!this.config.enabled) {
      return this.outputPolicy.createStaticStream(
        'Fitur Asisten SIPENGSUI sedang dinonaktifkan. Silakan coba lagi nanti.',
      );
    }

    if (!this.config.apiKey) {
      this.logger.warn('[AI] GEMINI_API_KEY tidak dikonfigurasi.');
      return this.outputPolicy.createStaticStream(
        'Maaf, layanan Asisten SIPENGSUI sedang tidak dapat digunakan. Silakan coba kembali beberapa saat lagi.',
      );
    }

    // 1. Validasi request (fail closed).
    const messages = await this.inputPolicy.validateMessages(input.body);
    const question = extractLastUserText(messages);

    // 2. Evaluasi kebijakan input (injection + topik + kill switch).
    const decision = this.inputPolicy.evaluate({
      question,
      request: input.request,
    });

    if (!decision.allowed) {
      this.audit.recordPolicyBlock(decision.riskLevel);
      return this.outputPolicy.createStaticStream(
        decision.safeMessage ??
          'Permintaan tersebut tidak dapat diproses. Asisten SIPENGSUI hanya dapat membantu informasi dan layanan resmi SIPENGSUI.',
      );
    }

    // 3. Retrieval knowledge (filter akses: guest → public only).
    const userId = decision.userId;
    const roles = decision.roles;
    let sources: KnowledgeChunk[];
    try {
      sources = await this.retrieveSources(
        decision.normalizedQuestion,
        userId,
        roles,
      );
    } catch (error) {
      this.audit.recordProviderError({ error });
      return this.outputPolicy.createStaticStream(
        'Maaf, basis pengetahuan SIPENGSUI sedang tidak tersedia. Silakan coba lagi nanti.',
      );
    }
    const context = formatSources(sources);

    // 4. Kirim pesan terakhir (maks 12) ke model.
    const limitedMessages = messages.slice(-this.config.maxHistoryMessages);
    const modelMessages = await convertToModelMessages(limitedMessages);

    const result = streamText({
      model: this.gemini.model(),
      system: buildSipengsuiSystemPrompt(context),
      messages: modelMessages,
      temperature: 0.2,
      maxOutputTokens: this.config.maxOutputTokens,
      providerOptions: {
        google: GOOGLE_SAFETY_SETTINGS,
      },
      onFinish: (event) => {
        const usage = event.usage as
          | {
              totalTokens?: number;
              inputTokens?: number;
              outputTokens?: number;
            }
          | undefined;
        this.audit.recordCompletion({
          channel: 'WEB',
          userId,
          sourceIds: sources.map((source) => source.id),
          usage,
          latencyMs: Date.now() - startedAt,
        });
      },
      onError: ({ error }) => {
        this.audit.recordProviderError({ error });
      },
    });

    return result.toUIMessageStream();
  }

  async createTextAnswer(input: {
    question: string;
    userId?: string;
    roles?: string[];
    channel?: string;
  }): Promise<string> {
    const startedAt = Date.now();
    const question = input.question.trim();
    if (!this.config.enabled) {
      return 'Fitur Asisten SIPENGSUI sedang dinonaktifkan. Silakan coba lagi nanti.';
    }
    if (!this.config.apiKey) {
      this.logger.warn('[AI] GEMINI_API_KEY tidak dikonfigurasi.');
      return 'Maaf, layanan Asisten SIPENGSUI sedang tidak dapat digunakan. Silakan coba kembali beberapa saat lagi.';
    }
    if (question.length > this.config.maxInputChars) {
      return `Pesan terlalu panjang. Maksimal ${this.config.maxInputChars} karakter.`;
    }

    const decision = this.inputPolicy.evaluate({
      question,
      request: undefined,
    });
    if (!decision.allowed) {
      this.audit.recordPolicyBlock(decision.riskLevel);
      return (
        decision.safeMessage ??
        'Permintaan tersebut tidak dapat diproses. Asisten SIPENGSUI hanya dapat membantu informasi dan layanan resmi SIPENGSUI.'
      );
    }

    let sources: KnowledgeChunk[];
    try {
      sources = await this.retrieveSources(
        decision.normalizedQuestion,
        input.userId,
        input.roles,
      );
    } catch (error) {
      this.audit.recordProviderError({ error });
      return 'Maaf, basis pengetahuan SIPENGSUI sedang tidak tersedia. Silakan coba lagi nanti.';
    }
    try {
      const result = await generateText({
        model: this.gemini.model(),
        system: buildSipengsuiSystemPrompt(formatSources(sources)),
        messages: [{ role: 'user', content: decision.normalizedQuestion }],
        temperature: 0.2,
        maxOutputTokens: this.config.maxOutputTokens,
        providerOptions: {
          google: GOOGLE_SAFETY_SETTINGS,
        },
      });
      const text = result.text.trim();
      if (
        !this.outputPolicy.checkFinish(
          String(result.finishReason ?? 'stop'),
          text,
        )
      ) {
        return this.outputPolicy.outputBlockMessage();
      }
      this.audit.recordCompletion({
        channel: input.channel ?? 'WEB',
        userId: input.userId,
        sourceIds: sources.map((source) => source.id),
        usage: result.usage,
        latencyMs: Date.now() - startedAt,
      });
      return text || 'Maaf, saya belum memiliki jawaban yang tersedia.';
    } catch (error) {
      this.audit.recordProviderError({ error });
      return 'Maaf, layanan Asisten SIPENGSUI sedang mengalami kendala. Silakan coba kembali beberapa saat lagi.';
    }
  }

  private async retrieveSources(
    question: string,
    userId?: string,
    roles?: string[],
  ): Promise<KnowledgeChunk[]> {
    const [staticSources, prismaSources, summaryChunk] = await Promise.all([
      this.staticKnowledge.search(question, { limit: 3, userId, roles }),
      this.prismaKnowledge.search(question, { limit: 4, userId, roles }),
      this.prismaKnowledge.getSummaryChunk(),
    ]);
    return dedupeSources([
      ...(summaryChunk ? [summaryChunk] : []),
      ...staticSources,
      ...prismaSources,
    ]).slice(0, 5);
  }
}

function formatSources(sources: KnowledgeChunk[]): string {
  return sources
    .map(
      (source, index) =>
        `[SUMBER ${index + 1}]
ID: ${source.id}
Judul: ${source.title}
Isi:
${source.content}`,
    )
    .join('\n\n');
}

function dedupeSources(sources: KnowledgeChunk[]): KnowledgeChunk[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}
