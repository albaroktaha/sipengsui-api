import { createHash } from 'node:crypto';
import { createRejectionLetterVerificationToken } from './rejection-letter-token';

describe('rejection-letter verification tokens', () => {
  it('creates an opaque 256-bit token and persists only its SHA-256 digest', () => {
    const { token, tokenHash } = createRejectionLetterVerificationToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(tokenHash).not.toContain(token);
  });

  it('generates independent tokens for separate documents', () => {
    const first = createRejectionLetterVerificationToken();
    const second = createRejectionLetterVerificationToken();

    expect(second.token).not.toBe(first.token);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });
});
