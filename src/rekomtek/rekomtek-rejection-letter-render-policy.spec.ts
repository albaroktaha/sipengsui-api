import { shouldRenderRejectionFindingsSeparately } from './rekomtek-rejection-letter';

describe('rejection-letter finding rendering policy', () => {
  const findings = [
    { requirement: 'Dokumen teknis', note: 'Peta belum lengkap.' },
  ];

  it('avoids duplicating findings already rendered by the configured body', () => {
    expect(
      shouldRenderRejectionFindingsSeparately(
        'Permohonan ditinjau.\n\nAlasan: 1. Dokumen teknis: Peta belum lengkap.',
        findings,
      ),
    ).toBe(false);
  });

  it('keeps the finding list when the body does not contain every finding', () => {
    expect(
      shouldRenderRejectionFindingsSeparately('Permohonan ditinjau.', findings),
    ).toBe(true);
  });
});
