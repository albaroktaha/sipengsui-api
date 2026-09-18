import { rekomtekFileContentDisposition } from './rekomtek-file-delivery';

describe('Rekomtek file delivery', () => {
  it('uses inline disposition for an authenticated browser fetch', () => {
    expect(
      rekomtekFileContentDisposition('draft-surat-penolakan.pdf', 'fetch'),
    ).toBe('inline; filename="draft-surat-penolakan.pdf"');
  });

  it('keeps attachment disposition for regular API downloads', () => {
    expect(rekomtekFileContentDisposition('surat-"final".pdf', undefined)).toBe(
      'attachment; filename="surat-final.pdf"',
    );
  });
});
