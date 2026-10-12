import {
  buildRejectionLetterDraft,
  buildFinalRejectionLetter,
  buildLocalTestRejectionLetterPresentation,
  renderRejectionLetterPdf,
  REJECTION_LETTER_LOGO_SIZE_PT,
  assertRejectionLetterFontsAvailable,
} from './rekomtek-rejection-letter';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRejectionLetterQrPng } from './rejection-letter-qr';

function extractPdfText(pdf: Buffer): string {
  const directory = mkdtempSync(join(tmpdir(), 'rejection-letter-pdf-'));
  try {
    const path = join(directory, 'letter.pdf');
    writeFileSync(path, pdf);
    return execFileSync('pdftotext', ['-layout', path, '-'], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

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

  it('uses the saved page size from the template layout when rendering a PDF', async () => {
    const draft = buildRejectionLetterDraft(input);
    const baseline = await renderRejectionLetterPdf(draft);
    const custom = await renderRejectionLetterPdf({
      ...draft,
      layoutConfig: {
        pageSize: 'F4',
        marginTopMm: 24,
        marginRightMm: 20,
        marginBottomMm: 22,
        marginLeftMm: 20,
        bodyFontSizePt: 11,
        bodyLineGapPt: 4,
        paragraphSpacingPt: 10,
        headerAlignment: 'LEFT',
        logoPosition: 'RIGHT',
      },
    } as never);
    const mediaBox = (pdf: Buffer) =>
      pdf.toString('latin1').split('MediaBox [')[1]?.split(']')[0];

    expect(mediaBox(custom)).toBeDefined();
    expect(mediaBox(custom)).not.toBe(mediaBox(baseline));
  });

  it('renders letter blocks in the configured drag-and-drop order', async () => {
    const draft = buildRejectionLetterDraft(input);
    const defaultText = extractPdfText(await renderRejectionLetterPdf(draft));
    const reorderedText = extractPdfText(
      await renderRejectionLetterPdf({
        ...draft,
        layoutConfig: {
          pageSize: 'A4',
          marginTopMm: 18.344,
          marginRightMm: 22.578,
          marginBottomMm: 19.756,
          marginLeftMm: 22.578,
          bodyFontSizePt: 10,
          bodyLineGapPt: 2,
          paragraphSpacingPt: 4,
          headerAlignment: 'CENTER',
          logoPosition: 'LEFT',
          blockOrder: [
            'LETTERHEAD',
            'TITLE',
            'BODY',
            'DATE',
            'LETTER_META',
            'RECIPIENT',
            'CLOSING',
            'SIGNATURE',
          ],
          blockAlignments: {},
        } as never,
      }),
    );

    expect(defaultText.indexOf('Yth.')).toBeLessThan(
      defaultText.indexOf('Sehubungan dengan Permohonan'),
    );
    expect(reorderedText.indexOf('Sehubungan dengan Permohonan')).toBeLessThan(
      reorderedText.indexOf('Yth.'),
    );
  });

  it('embeds the official verification QR in the internal preview PDF', async () => {
    const draft = buildRejectionLetterDraft(input);
    const qr = await createRejectionLetterQrPng(
      'https://example.go.id/verifikasi-surat?token=opaque-token',
    );
    const withQr = await renderRejectionLetterPdf({
      ...draft,
      verificationQrPng: qr,
    });
    const withoutQr = await renderRejectionLetterPdf(draft);

    expect(withQr.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(withQr.length).toBeGreaterThan(withoutQr.length + 1000);
  }, 15_000);

  it('renders configured letterhead address and logo into the internal PDF', async () => {
    const logo = await createRejectionLetterQrPng(
      'https://example.go.id/logo-probe',
    );
    const base = buildRejectionLetterDraft(input);
    const plain = await renderRejectionLetterPdf(base);
    const branded = await renderRejectionLetterPdf({
      ...base,
      institutionAddress: 'Jalan Pemerintahan No. 1',
      logoBuffer: logo,
    });

    expect(branded.length).toBeGreaterThan(plain.length + 1000);
  }, 15_000);

  it('uses Arial and the exact official logo dimensions', async () => {
    expect(REJECTION_LETTER_LOGO_SIZE_PT).toEqual({
      width: (2.41 * 72) / 2.54,
      height: (2.94 * 72) / 2.54,
    });
    const pdf = await renderRejectionLetterPdf(
      buildRejectionLetterDraft(input),
    );
    expect(pdf.toString('latin1')).toMatch(/Arial/);
  });

  it('rejects a missing configured Arial font before a number can be allocated', () => {
    const previous = process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH;
    process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH =
      'C:/not-installed/arial.ttf';
    try {
      expect(() => assertRejectionLetterFontsAvailable()).toThrow(/Arial/);
    } finally {
      if (previous === undefined)
        delete process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH;
      else process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH = previous;
    }
  });

  it('uses the registered company throughout the final letter and removes draft placeholders', async () => {
    const final = buildFinalRejectionLetter(
      {
        ...input,
        applicantName: 'Budi Pemohon',
        applicantOrganization: 'PT Air Mandiri',
      },
      {
        letterNumber: '600/123/SDA/2026',
        subject: 'Penolakan Permohonan Izin Sumber Daya Air',
        letterDate: '2026-10-06',
        city: 'Medan',
        institution: 'DINAS SUMBER DAYA AIR',
        signatoryName: 'Pejabat Contoh',
        signatoryPosition: 'Kepala Bidang',
        signatoryIdentity: 'NIP. 123456',
      },
    );
    expect(final.recipientLines[0]).toBe('Direktur PT Air Mandiri');
    expect(final.body).toContain('PT Air Mandiri');
    expect(final.body).not.toContain('Budi Pemohon');
    expect(final.body).toContain(input.applicationType);
    expect(final.body).toContain(input.findings[0].note);
    expect(final.number).toBe('600/123/SDA/2026');
    expect(final.letterDate).toBe('Medan, 6 Oktober 2026');
    expect(final.disclaimer).toBe('');
    expect(JSON.stringify(final)).not.toMatch(/\[NOMOR SURAT\]|DRAFT|Karsa/);
    expect(
      (await renderRejectionLetterPdf(final)).subarray(0, 5).toString(),
    ).toBe('%PDF-');
  });

  it('strips Rekomtek-specific copy and red draft notices from the local test letter only', () => {
    const source = buildRejectionLetterDraft(input);
    const local = buildLocalTestRejectionLetterPresentation(source);

    expect(local).toMatchObject({
      title: 'SURAT PENOLAKAN',
      subject: 'Penolakan Permohonan',
      disclaimer: '',
      applicationNumber: '',
      applicationTitle: '',
      applicationType: '',
      evaluationSummary: '',
      findings: [],
      localTestPresentation: true,
    });
    expect(local.recipientLines).toEqual(source.recipientLines);
    expect(local.body).toContain('PT Tirta Contoh');
    expect(local.body).not.toMatch(
      /rekomtek|rekomendasi teknis|evaluasi ulang/i,
    );
    expect(local.body).not.toContain(input.findings[0].note);
    expect(source.disclaimer).toContain('DRAFT');
    expect(source.title).toContain('REKOMENDASI TEKNIS');
  });

  it('renders the local QR-test PDF without the red notice or Rekomtek sections', async () => {
    const draft = buildRejectionLetterDraft(input);
    const pdf = await renderRejectionLetterPdf({
      ...draft,
      disclaimer: 'PRATINJAU LOKAL',
    });
    const text = extractPdfText(pdf);

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(text).toContain('SURAT PENOLAKAN');
    expect(text).not.toMatch(
      /DRAFT|PRATINJAU LOKAL|REKOMTEK|REKOMENDASI TEKNIS/i,
    );
    expect(text).not.toContain('Alasan penolakan');
    expect(text).not.toContain('Tambahkan alasan penolakan');
    expect(text).not.toContain(input.findings[0].note);
  }, 15_000);
});
