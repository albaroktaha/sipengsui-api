import PDFDocument from 'pdfkit';

export interface RejectionLetterFinding {
  requirement: string;
  note: string;
}

export interface RejectionLetterDraftInput {
  applicationNumber: string;
  applicationTitle: string;
  applicationType: string;
  applicantName: string;
  applicantOrganization?: string | null;
  applicantAddress?: string | null;
  evaluationSummary?: string | null;
  findings: RejectionLetterFinding[];
}

export interface RejectionLetterDraft {
  institution: string;
  title: string;
  number: string;
  subject: string;
  recipientLines: string[];
  applicationNumber: string;
  applicationTitle: string;
  applicationType: string;
  evaluationSummary: string;
  findings: RejectionLetterFinding[];
  body: string;
  disclaimer: string;
  closing: string;
  signatureLines: string[];
}

const DRAFT_INSTITUTION = '[NAMA INSTANSI / UNIT KERJA]';
const DRAFT_NUMBER = '[NOMOR SURAT]';
const DRAFT_DATE = '[TEMPAT], [TANGGAL SURAT]';
const DRAFT_SIGNATORY = '[NAMA PEJABAT PENANDATANGAN]';
const DRAFT_IDENTITY = '[NIP / IDENTITAS PEJABAT]';
const DRAFT_DISCLAIMER =
  'DRAFT - BELUM MERUPAKAN SURAT RESMI. Sesuaikan nomor surat, dasar hukum, redaksi, pejabat penandatangan, dan ketentuan penerbitan sebelum digunakan.';

function clean(value: string | null | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function cleanFinding(
  finding: RejectionLetterFinding,
): RejectionLetterFinding | null {
  const requirement = clean(finding.requirement, 'Berkas Persyaratan');
  const note = clean(
    finding.note,
    'Tambahkan alasan penolakan yang dapat ditindaklanjuti.',
  );
  if (!requirement && !note) return null;
  return { requirement, note };
}

export function buildRejectionLetterDraft(
  input: RejectionLetterDraftInput,
): RejectionLetterDraft {
  const applicationNumber = clean(
    input.applicationNumber,
    '[Nomor permohonan]',
  );
  const applicationTitle = clean(input.applicationTitle, '[Judul permohonan]');
  const applicationType = clean(input.applicationType, '[Jenis permohonan]');
  const applicantName = clean(input.applicantName, '[Nama pemohon]');
  const applicantOrganization = input.applicantOrganization?.trim();
  const applicantAddress = input.applicantAddress?.trim();
  const findings = input.findings
    .map(cleanFinding)
    .filter((finding): finding is RejectionLetterFinding => finding !== null);
  const evaluationSummary = clean(
    input.evaluationSummary,
    'Permohonan belum memenuhi persyaratan berdasarkan hasil evaluasi ulang.',
  );
  const findingText = findings.length
    ? findings
        .map(
          ({ requirement, note }, index) =>
            `${index + 1}. ${requirement}: ${note}`,
        )
        .join('\n')
    : '1. [Tambahkan alasan penolakan berdasarkan hasil evaluasi ulang].';

  const recipientLines = [applicantName];
  if (applicantOrganization && applicantOrganization !== applicantName) {
    recipientLines.push(applicantOrganization);
  }
  recipientLines.push(applicantAddress || '[Alamat pemohon]', 'di Tempat');

  const body = [
    `Sehubungan dengan Permohonan Rekomendasi Teknis nomor ${applicationNumber} dengan judul "${applicationTitle}" (${applicationType}), setelah dilakukan evaluasi dokumen dan evaluasi ulang, permohonan tersebut belum memenuhi persyaratan yang ditetapkan.`,
    evaluationSummary,
    `Berdasarkan hasil evaluasi ulang, permohonan tersebut dinyatakan tidak memenuhi dengan alasan berikut:\n${findingText}`,
    'Dengan ini disampaikan bahwa Permohonan Rekomendasi Teknis tersebut ditolak. Keputusan, dasar hukum, dan ketentuan tindak lanjut pada draft ini masih harus disesuaikan dengan ketentuan yang berlaku.',
  ].join('\n\n');

  return {
    institution: DRAFT_INSTITUTION,
    title: 'SURAT PENOLAKAN PERMOHONAN REKOMENDASI TEKNIS',
    number: DRAFT_NUMBER,
    subject: 'Penolakan Permohonan Rekomendasi Teknis',
    recipientLines,
    applicationNumber,
    applicationTitle,
    applicationType,
    evaluationSummary,
    findings,
    body,
    disclaimer: DRAFT_DISCLAIMER,
    closing:
      'Demikian disampaikan untuk menjadi perhatian dan ditindaklanjuti sesuai ketentuan yang berlaku.',
    signatureLines: [
      DRAFT_DATE,
      'Pejabat Rekomtek',
      DRAFT_SIGNATORY,
      DRAFT_IDENTITY,
    ],
  };
}

function renderFindingList(
  document: PDFKit.PDFDocument,
  findings: RejectionLetterFinding[],
): void {
  if (findings.length === 0) {
    document.text(
      '1. [Tambahkan alasan penolakan berdasarkan hasil evaluasi ulang].',
      {
        indent: 12,
        lineGap: 3,
      },
    );
    return;
  }

  findings.forEach((finding, index) => {
    document.text(`${index + 1}. ${finding.requirement}`, {
      indent: 12,
      continued: true,
      lineGap: 3,
    });
    document.text(`: ${finding.note}`, { lineGap: 3 });
  });
}

export function renderRejectionLetterPdf(
  draft: RejectionLetterDraft,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 52, right: 64, bottom: 56, left: 64 },
      info: {
        Title: draft.title,
        Subject: draft.subject,
        Author: 'SIPENGSUI',
        Keywords: 'rekomtek, surat penolakan, draft',
      },
    });
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    document
      .fillColor('#8a1c1c')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(draft.disclaimer, { align: 'center', lineGap: 2 });
    document.moveDown(1.5);

    document
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(draft.institution, {
        align: 'center',
      });
    document.moveDown(0.7);
    document.fontSize(12).text(draft.title, { align: 'center' });
    document.moveDown(0.5);
    document
      .strokeColor('#111827')
      .lineWidth(0.8)
      .moveTo(document.page.margins.left, document.y)
      .lineTo(document.page.width - document.page.margins.right, document.y)
      .stroke();
    document.moveDown(1.2);

    document.font('Helvetica').fontSize(10.5).fillColor('#111827');
    document.text(`Nomor    : ${draft.number}`);
    document.text('Sifat       : Biasa');
    document.text('Lampiran : -');
    document.text(`Hal         : ${draft.subject}`);
    document.moveDown(1.4);

    document.text('Yth.');
    draft.recipientLines.forEach((line) => document.text(line));
    document.moveDown(1.2);
    document.text('Dengan hormat,');
    document.moveDown(0.7);

    const paragraphs = draft.body.split('\n\n');
    paragraphs.slice(0, 2).forEach((paragraph) => {
      document.text(paragraph, { align: 'justify', lineGap: 3 });
      document.moveDown(0.7);
    });

    document.font('Helvetica-Bold').text('Alasan penolakan');
    document.moveDown(0.35);
    document.font('Helvetica');
    renderFindingList(document, draft.findings);
    document.moveDown(0.8);

    paragraphs.slice(3).forEach((paragraph) => {
      document.text(paragraph, { align: 'justify', lineGap: 3 });
      document.moveDown(0.7);
    });

    document.text(draft.closing, { align: 'justify', lineGap: 3 });
    document.moveDown(2.2);
    document.text(draft.signatureLines[0], { align: 'right' });
    document.moveDown(2.8);
    document.text(draft.signatureLines[1], { align: 'right' });
    document.text(draft.signatureLines[2], { align: 'right' });
    document.text(draft.signatureLines[3], { align: 'right' });

    document.end();
  });
}

export function rejectionLetterFileName(applicationNumber: string): string {
  const normalized = applicationNumber
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${normalized || 'rekomtek'}-draft-surat-penolakan.pdf`;
}
