import {
  buildRejectionLetterDraft,
  renderRejectionLetterPdf,
} from './rekomtek-rejection-letter';

describe('rekomtek rejection letter draft', () => {
  const input = {
    applicationNumber: 'RKT/001/2026',
    applicationTitle: 'Pemanfaatan Air Permukaan untuk Irigasi',
    applicationType: 'Izin Baru',
    applicantName: 'PT Tirta Contoh',
    applicantOrganization: 'PT Tirta Contoh',
    applicantAddress: 'Jl. Contoh No. 1, Kabupaten Bandung',
    evaluationSummary: 'Persyaratan belum terpenuhi pada evaluasi ulang.',
    findings: [
      {
        requirement: 'Dokumen teknis pemanfaatan air',
        note: 'Dokumen belum memuat peta lokasi yang dapat diverifikasi.',
      },
    ],
  };

  it('builds a clearly marked draft with the supplied findings', () => {
    const draft = buildRejectionLetterDraft(input);

    expect(draft.title).toBe('SURAT PENOLAKAN PERMOHONAN REKOMENDASI TEKNIS');
    expect(draft.subject).toContain('Penolakan Permohonan Rekomendasi Teknis');
    expect(draft.disclaimer).toContain('DRAFT');
    expect(draft.body).toContain(input.applicationNumber);
    expect(draft.body).toContain(input.findings[0].requirement);
    expect(draft.body).toContain(input.findings[0].note);
  });

  it('renders an A4 PDF buffer', async () => {
    const pdf = await renderRejectionLetterPdf(
      buildRejectionLetterDraft(input),
    );

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
