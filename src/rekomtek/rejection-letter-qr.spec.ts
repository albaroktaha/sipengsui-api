import {
  buildRejectionLetterVerificationUrl,
  createRejectionLetterQrPng,
} from './rejection-letter-qr';

describe('rejection-letter verification QR', () => {
  it('builds a HTTPS URL with only the opaque verification token', () => {
    const url = buildRejectionLetterVerificationUrl(
      'https://surat.example.go.id',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(url).toBe(
      'https://surat.example.go.id/verifikasi-surat-penolakan/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(url).not.toContain('company');
    expect(url).not.toContain('application');
  });

  it('rejects insecure or credential-bearing verification domains', () => {
    expect(() =>
      buildRejectionLetterVerificationUrl(
        'http://surat.example.go.id',
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ),
    ).toThrow('Domain verifikasi harus HTTPS resmi tanpa kredensial');
    expect(() =>
      buildRejectionLetterVerificationUrl(
        'https://user:pass@surat.example.go.id',
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      ),
    ).toThrow('Domain verifikasi harus HTTPS resmi tanpa kredensial');
  });

  it('allows HTTP only for an explicitly enabled loopback test URL', () => {
    expect(
      buildRejectionLetterVerificationUrl(
        'http://localhost:3001',
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        { allowInsecureLoopbackForTest: true },
      ),
    ).toBe(
      'http://localhost:3001/verifikasi-surat-penolakan/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(() =>
      buildRejectionLetterVerificationUrl(
        'http://example.com',
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        { allowInsecureLoopbackForTest: true },
      ),
    ).toThrow('Domain verifikasi harus HTTPS resmi tanpa kredensial');
  });

  it('generates a PNG QR for an explicitly enabled local-test URL', async () => {
    const image = await createRejectionLetterQrPng(
      'http://localhost:3001/verifikasi-surat-penolakan/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      { allowInsecureLoopbackForTest: true },
    );
    expect(image.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }, 15_000);

  it('produces a real PNG QR image that can be placed in the PDF', async () => {
    const image = await createRejectionLetterQrPng(
      'https://surat.example.go.id/verifikasi-surat-penolakan/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(image.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(image.length).toBeGreaterThan(500);
  }, 15_000);
});
