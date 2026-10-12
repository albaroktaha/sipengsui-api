import { createRejectionLetterQrPng } from './rejection-letter-qr';
import { decodeRejectionLetterLogo } from './rejection-letter-logo';

describe('decodeRejectionLetterLogo', () => {
  it('accepts a bounded real PNG data URL', async () => {
    const png = await createRejectionLetterQrPng(
      'https://example.go.id/verify/opaque',
    );

    expect(
      decodeRejectionLetterLogo(
        `data:image/png;base64,${png.toString('base64')}`,
      ),
    ).toEqual(png);
  });

  it('rejects SVG, MIME spoofing, and oversized logos', async () => {
    expect(
      decodeRejectionLetterLogo('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    ).toBeNull();
    expect(
      decodeRejectionLetterLogo('data:image/png;base64,PHN2Zz48L3N2Zz4='),
    ).toBeNull();
    expect(
      decodeRejectionLetterLogo(`data:image/png;base64,${'A'.repeat(800_000)}`),
    ).toBeNull();
  });
});
