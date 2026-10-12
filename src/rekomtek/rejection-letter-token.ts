import { createHash, randomBytes } from 'node:crypto';

export function createRejectionLetterVerificationToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashRejectionLetterVerificationToken(token: string): string {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    throw new Error('Token verifikasi surat tidak valid');
  }
  return createHash('sha256').update(token).digest('hex');
}
