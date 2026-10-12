import { buildConfiguredRejectionLetterDraft } from './rejection-letter-template';
import { resolveRejectionLetterLayoutConfig } from './rejection-letter-layout';

const baseInput = {
  applicantName: 'Rina',
  applicantOrganization: 'PT Air Sejahtera',
  applicantAddress: 'Jl. Merdeka 10',
  applicationNumber: 'REG-123',
  applicationTitle: 'Penggunaan Air',
  applicationType: 'Izin Baru',
  evaluationSummary: 'Dokumen belum sesuai.',
  findings: [{ requirement: 'Peta lokasi', note: 'Koordinat belum cocok.' }],
  template: {
    subjectTemplate: 'Penolakan {{applicationNumber}}',
    bodyTemplate:
      '{{companyName}} mengajukan {{applicationNumber}} untuk {{applicationTitle}} ({{applicationType}}). {{evaluationSummary}} Alasan: {{rejectionReasons}}',
    closingTemplate: 'Hormat kami, {{signatoryName}}',
  },
  settings: {
    institutionName: 'Dinas Contoh',
    institutionAddress: 'Jalan Contoh No. 1',
    issueCity: 'Kota Contoh',
    signatoryName: 'Kepala Bidang Contoh',
    signatoryPosition: 'Kepala Bidang',
    signatoryNip: 'NIP-1',
  },
  outgoingNumber: 'AG/7/2026',
  outgoingDate: new Date('2026-06-01T00:00:00.000Z'),
};

describe('configured rejection-letter snapshot', () => {
  it('uses the registered company, latest findings, and configured signatory', () => {
    const letter = buildConfiguredRejectionLetterDraft(baseInput);

    expect(letter.recipientLines).toEqual([
      'PT Air Sejahtera',
      'Jl. Merdeka 10',
      'di Tempat',
    ]);
    expect(letter.subject).toBe('Penolakan REG-123');
    expect(letter.body).toContain(
      'PT Air Sejahtera mengajukan REG-123 untuk Penggunaan Air',
    );
    expect(letter.body).toContain('Peta lokasi: Koordinat belum cocok.');
    expect(letter.closing).toBe('Hormat kami, Kepala Bidang Contoh');
    expect(letter.number).toBe('AG/7/2026');
    expect(letter.institutionAddress).toBe('Jalan Contoh No. 1');
  });

  it('carries the selected template layout into the generated draft', () => {
    const layoutConfig = {
      pageSize: 'F4' as const,
      marginTopMm: 25,
      marginRightMm: 20,
      marginBottomMm: 22,
      marginLeftMm: 20,
      bodyFontSizePt: 11,
      bodyLineGapPt: 3,
      paragraphSpacingPt: 6,
      headerAlignment: 'LEFT' as const,
      logoPosition: 'RIGHT' as const,
    };

    const letter = buildConfiguredRejectionLetterDraft({
      ...baseInput,
      template: { ...baseInput.template, layoutConfig },
    });

    expect(letter.layoutConfig).toEqual(
      resolveRejectionLetterLayoutConfig(layoutConfig),
    );
  });

  it('rejects unknown or unresolved template fields instead of inventing text', () => {
    expect(() =>
      buildConfiguredRejectionLetterDraft({
        ...baseInput,
        template: {
          ...baseInput.template,
          bodyTemplate: `${baseInput.template.bodyTemplate} {{unknownOfficialClause}}`,
        },
      }),
    ).toThrow('Template surat memuat variabel yang tidak didukung');
  });
});
