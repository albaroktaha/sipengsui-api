import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
} from '@ai-sdk/provider';

/**
 * Fake model Gemini untuk test — tidak memanggil API berbayar.
 */
export class FakeGeminiModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'google.generative-ai';
  readonly modelId = 'gemini-3.5-flash';
  readonly supportedUrls = {};

  private readonly usage: LanguageModelV4Usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  };

  private readonly content: LanguageModelV4Content[] = [];

  doGenerate(options: LanguageModelV4CallOptions): Promise<{
    content: LanguageModelV4Content[];
    finishReason: LanguageModelV4FinishReason;
    usage: LanguageModelV4Usage;
  }> {
    const text = this.extractText(options);
    return Promise.resolve({
      content: [
        ...this.content,
        { type: 'text', text: `Jawaban simulasi untuk: ${text}` },
      ],
      finishReason: 'stop',
      usage: this.usage,
    });
  }

  doStream(options: LanguageModelV4CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV4StreamPart>;
  }> {
    const text = this.extractText(options);
    const parts: LanguageModelV4StreamPart[] = [
      { type: 'text-start', id: 't1' },
      {
        type: 'text-delta',
        id: 't1',
        delta: `Jawaban simulasi untuk: ${text}`,
      },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish',
        usage: this.usage,
        finishReason: 'stop',
      },
    ];

    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    });

    return Promise.resolve({ stream });
  }

  private extractText(options: LanguageModelV4CallOptions): string {
    const prompt = options.prompt;
    if (Array.isArray(prompt)) {
      for (const item of prompt) {
        if ('text' in item && typeof item.text === 'string') return item.text;
      }
    }
    return 'pertanyaan';
  }
}

export const fakeGeminiModel = new FakeGeminiModel();
