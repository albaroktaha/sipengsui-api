import { Test, type TestingModule } from '@nestjs/testing';
import { TopicPolicyService } from '../guardrails/topic-policy.service';

describe('TopicPolicyService', () => {
  let service: TopicPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TopicPolicyService],
    }).compile();

    service = module.get<TopicPolicyService>(TopicPolicyService);
  });

  it('harus diizinkan untuk pertanyaan tentang SIPENGSUI', () => {
    const result = service.evaluate('Apa itu SIPENGSUI dan apa saja fiturnya?');
    expect(result.allowed).toBe(true);
    expect(result.matchedTopics).toContain('sipengsui');
  });

  it('harus diizinkan untuk pertanyaan hidrologi', () => {
    const result = service.evaluate('Bagaimana cara melihat data curah hujan?');
    expect(result.allowed).toBe(true);
  });

  it('harus mengarahkan pertanyaan umum di luar domain', () => {
    const result = service.evaluate('Tuliskan esai tentang sejarah Indonesia.');
    expect(result.allowed).toBe(false);
  });

  it('harus mengarahkan topik politik', () => {
    const result = service.evaluate('Bagaimana pendapat Anda tentang pemilu?');
    expect(result.allowed).toBe(false);
  });

  it('harus mengizinkan sapaan singkat', () => {
    const result = service.evaluate('Halo');
    expect(result.allowed).toBe(true);
  });

  it('harus mengarahkan pertanyaan ambigu (domain + luar domain)', () => {
    const result = service.evaluate(
      'Bagaimana politik mempengaruhi pengelolaan sungai?',
    );
    expect(result.allowed).toBe(false);
  });
});
