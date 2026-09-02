import { AiService } from './ai.service';

describe('AiService WhatsApp retrieval fallback', () => {
  it('returns a safe fallback when public knowledge retrieval fails', async () => {
    const audit = {
      recordProviderError: jest.fn(),
      recordCompletion: jest.fn(),
      recordPolicyBlock: jest.fn(),
    };
    const prismaKnowledge = {
      search: jest.fn().mockRejectedValue(new Error('database unavailable')),
      getSummaryChunk: jest.fn().mockResolvedValue(null),
    };
    const service = new AiService(
      {
        enabled: true,
        apiKey: 'test-key',
        maxInputChars: 2_000,
        maxOutputTokens: 100,
      } as never,
      { model: jest.fn() } as never,
      {
        evaluate: jest.fn().mockReturnValue({
          allowed: true,
          normalizedQuestion: 'informasi publik',
          riskLevel: 'low',
        }),
      } as never,
      { checkFinish: jest.fn(), outputBlockMessage: jest.fn() } as never,
      { search: jest.fn().mockResolvedValue([]) } as never,
      prismaKnowledge as never,
      audit as never,
    );

    await expect(
      service.createTextAnswer({
        question: 'informasi publik',
        channel: 'WHATSAPP',
      }),
    ).resolves.toContain('basis pengetahuan');
    expect(audit.recordProviderError).toHaveBeenCalled();
  });
});
