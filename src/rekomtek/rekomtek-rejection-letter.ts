import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  getRejectionLetterPdfLayout,
  RejectionLetterLayoutBlockId,
  RejectionLetterLayoutConfig,
  resolveRejectionLetterLayoutConfig,
} from './rejection-letter-layout';

export const REJECTION_LETTER_LOGO_SIZE_PT = {
  width: (2.41 * 72) / 2.54,
  height: (2.94 * 72) / 2.54,
};

function arialFontPaths(): { regular: string; bold: string } {
  const windowsFonts = join(process.env.WINDIR || 'C:/Windows', 'Fonts');
  const regular =
    process.env.REJECTION_LETTER_ARIAL_REGULAR_PATH ||
    (process.platform === 'win32'
      ? join(windowsFonts, 'arial.ttf')
      : '/usr/share/fonts/truetype/msttcorefonts/Arial.ttf');
  const bold =
    process.env.REJECTION_LETTER_ARIAL_BOLD_PATH ||
    (process.platform === 'win32'
      ? join(windowsFonts, 'arialbd.ttf')
      : '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf');
  if (!existsSync(regular) || !existsSync(bold)) {
    throw new Error(
      'Font Arial Regular/Bold wajib tersedia untuk surat penolakan',
    );
  }
  return { regular, bold };
}

export function assertRejectionLetterFontsAvailable(): void {
  arialFontPaths();
}

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
  institutionAddress?: string;
  institutionPhoneFax?: string;
  institutionEmail?: string;
  institutionWebsite?: string;
  issueCity?: string;
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
  letterDate?: string;
  verificationQrPng?: Buffer;
  logoBuffer?: Buffer;
  localTestPresentation?: boolean;
  layoutConfig?: RejectionLetterLayoutConfig;
}

export interface RejectionLetterDetails {
  letterNumber: string;
  subject: string;
  letterDate: string;
  city: string;
  institution: string;
  institutionAddress?: string;
  institutionPhoneFax?: string;
  institutionEmail?: string;
  institutionWebsite?: string;
  signatoryName: string;
  signatoryPosition: string;
  signatoryRank?: string;
  signatoryIdentity?: string;
}

export function buildFinalRejectionLetter(
  input: RejectionLetterDraftInput,
  details: RejectionLetterDetails,
): RejectionLetterDraft {
  const letter = buildRejectionLetterDraft(input);
  const company = clean(input.applicantOrganization, input.applicantName);
  const date = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${details.letterDate}T00:00:00+07:00`));
  return {
    ...letter,
    institution: details.institution.trim(),
    institutionAddress: details.institutionAddress?.trim(),
    institutionPhoneFax: details.institutionPhoneFax?.trim(),
    institutionEmail: details.institutionEmail?.trim(),
    institutionWebsite: details.institutionWebsite?.trim(),
    issueCity: details.city.trim(),
    number: details.letterNumber.trim(),
    subject: details.subject.trim(),
    letterDate: `${details.city.trim()}, ${date}`,
    recipientLines: [
      input.applicantOrganization?.trim() ? `Direktur ${company}` : company,
      ...(input.applicantAddress?.trim()
        ? [input.applicantAddress.trim()]
        : []),
      'di Tempat',
    ],
    body: [
      `Menindaklanjuti permohonan dari ${company} dengan nomor registrasi ${letter.applicationNumber} perihal ${letter.applicationTitle} (${letter.applicationType}), bersama ini kami sampaikan bahwa permohonan Saudara ditolak berdasarkan hasil evaluasi ulang dokumen persyaratan.`,
      letter.evaluationSummary,
      `Kekurangan dokumen pendukung yang perlu dilengkapi:\n${letter.findings.map((finding, index) => `${index + 1}. ${finding.requirement}: ${finding.note}`).join('\n')}`,
      'Saudara diminta untuk memperbarui permohonan yang dilengkapi dengan dokumen pendukung sesuai hasil evaluasi agar dapat kami proses sebagaimana mestinya.',
    ].join('\n\n'),
    disclaimer: '',
    closing: 'Demikian kami sampaikan dan diucapkan terima kasih.',
    signatureLines: [
      '',
      details.signatoryPosition.trim(),
      details.signatoryName.trim(),
      details.signatoryRank?.trim() || '',
      details.signatoryIdentity?.trim() || '',
    ],
  };
}

export function buildLocalTestRejectionLetterPresentation(
  letter: RejectionLetterDraft,
): RejectionLetterDraft {
  const recipient = letter.recipientLines[0]?.trim() || 'Pemohon';
  const signatureLines = [...letter.signatureLines];
  if (/rekomtek|rekomendasi teknis/i.test(signatureLines[1] ?? '')) {
    signatureLines[1] = 'Pejabat yang Berwenang';
  }
  return {
    ...letter,
    title: 'SURAT PENOLAKAN',
    subject: 'Penolakan Permohonan',
    applicationNumber: '',
    applicationTitle: '',
    applicationType: '',
    evaluationSummary: '',
    findings: [],
    body: `Menindaklanjuti permohonan dari ${recipient}, bersama ini disampaikan bahwa permohonan tersebut belum dapat disetujui.`,
    disclaimer: '',
    closing: 'Demikian disampaikan untuk menjadi perhatian.',
    signatureLines,
    localTestPresentation: true,
  };
}

const DRAFT_INSTITUTION = '[NAMA INSTANSI / UNIT KERJA]';
const DRAFT_NUMBER = '[NOMOR SURAT]';
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
      '',
      'Pejabat Rekomtek',
      DRAFT_SIGNATORY,
      '',
      DRAFT_IDENTITY,
    ],
    layoutConfig: resolveRejectionLetterLayoutConfig(undefined),
  };
}

function renderFindingList(
  document: PDFKit.PDFDocument,
  findings: RejectionLetterFinding[],
  lineGapPt = 3,
  alignment: 'left' | 'center' | 'right' | 'justify' = 'justify',
): void {
  if (findings.length === 0) {
    document.text(
      '1. [Tambahkan alasan penolakan berdasarkan hasil evaluasi ulang].',
      {
        indent: 12,
        lineGap: lineGapPt,
        align: alignment,
      },
    );
    return;
  }

  findings.forEach((finding, index) => {
    document.text(`${index + 1}. ${finding.requirement}`, {
      indent: 12,
      continued: true,
      lineGap: lineGapPt,
      align: alignment,
    });
    document.text(`: ${finding.note}`, {
      lineGap: lineGapPt,
      align: alignment,
    });
  });
}

export function shouldRenderRejectionFindingsSeparately(
  body: string,
  findings: RejectionLetterFinding[],
): boolean {
  return (
    findings.length === 0 ||
    findings.some(
      (finding) => !body.includes(`${finding.requirement}: ${finding.note}`),
    )
  );
}

export function renderRejectionLetterPdf(
  draft: RejectionLetterDraft,
): Promise<Buffer> {
  if (draft.disclaimer === 'PRATINJAU LOKAL') {
    draft = buildLocalTestRejectionLetterPresentation(draft);
  }
  const layoutConfig = resolveRejectionLetterLayoutConfig(draft.layoutConfig);
  const pdfLayout = getRejectionLetterPdfLayout(layoutConfig);
  const fonts = arialFontPaths();
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: pdfLayout.size,
      margins: pdfLayout.margins,
      info: {
        Title: draft.title,
        Subject: draft.subject,
        Author: 'SIPENGSUI',
        Keywords: draft.localTestPresentation
          ? 'surat penolakan, uji lokal'
          : draft.disclaimer
            ? 'rekomtek, surat penolakan, draft'
            : 'rekomtek, surat penolakan',
      },
    });
    const chunks: Buffer[] = [];

    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.registerFont('Arial', fonts.regular);
    document.registerFont('Arial-Bold', fonts.bold);

    if (draft.disclaimer) {
      const isLocalPreview = draft.disclaimer === 'PRATINJAU LOKAL';
      document
        .fillColor(isLocalPreview ? '#64748b' : '#8a1c1c')
        .font('Arial-Bold')
        .fontSize(isLocalPreview ? 7 : 9)
        .text(draft.disclaimer, {
          align: isLocalPreview ? 'right' : 'center',
          lineGap: 2,
        });
      document.moveDown(isLocalPreview ? 0.8 : 1.5);
    }

    const left = document.page.margins.left;
    const right = document.page.width - document.page.margins.right;
    const alignmentFor = (block: RejectionLetterLayoutBlockId) => {
      const alignment =
        block === 'LETTERHEAD'
          ? layoutConfig.headerAlignment
          : (layoutConfig.blockAlignments[block] ?? 'LEFT');
      return alignment.toLowerCase() as 'left' | 'center' | 'right' | 'justify';
    };

    const renderBlock = (block: RejectionLetterLayoutBlockId) => {
      const alignment = alignmentFor(block);
      if (block === 'LETTERHEAD') {
        const headerTop = document.y;
        const logoOnLeft = layoutConfig.logoPosition === 'LEFT';
        document.fillColor('#111111');
        if (draft.logoBuffer) {
          document.image(
            draft.logoBuffer,
            logoOnLeft ? left : right - REJECTION_LETTER_LOGO_SIZE_PT.width,
            headerTop,
            {
              fit: [
                REJECTION_LETTER_LOGO_SIZE_PT.width,
                REJECTION_LETTER_LOGO_SIZE_PT.height,
              ],
              align: 'center',
              valign: 'center',
            },
          );
        }
        const textX = draft.logoBuffer
          ? logoOnLeft
            ? left + REJECTION_LETTER_LOGO_SIZE_PT.width + 12
            : left
          : left;
        const textWidth = draft.logoBuffer
          ? right - left - REJECTION_LETTER_LOGO_SIZE_PT.width - 12
          : right - left;
        const isNorthSumatraAgency =
          draft.institution.trim().toUpperCase() === 'DINAS SUMBER DAYA AIR';
        let headerTextY = headerTop + 3;
        if (isNorthSumatraAgency) {
          document
            .font('Arial-Bold')
            .fontSize(14)
            .text('PEMERINTAH PROVINSI SUMATERA UTARA', textX, headerTextY, {
              width: textWidth,
              align: alignment,
              lineBreak: false,
            });
          headerTextY += 18;
        }
        document
          .fillColor('#111111')
          .font('Arial-Bold')
          .fontSize(isNorthSumatraAgency ? 18 : 11)
          .text(draft.institution, textX, headerTextY, {
            width: textWidth,
            align: alignment,
            lineBreak: false,
          });
        headerTextY += isNorthSumatraAgency ? 23 : 15;

        const city = draft.issueCity?.trim();
        const contactRows = [
          draft.institutionAddress?.trim(),
          draft.institutionPhoneFax?.trim()
            ? `Telp/Fax: ${draft.institutionPhoneFax.trim()}`
            : undefined,
          draft.institutionEmail?.trim()
            ? `Email: ${draft.institutionEmail.trim()}`
            : undefined,
          draft.institutionWebsite?.trim()
            ? `Website: ${draft.institutionWebsite.trim()}`
            : undefined,
          city ? city.toUpperCase() : undefined,
        ].filter((row): row is string => Boolean(row));
        const cityRowIndex = city ? contactRows.length - 1 : -1;
        contactRows.forEach((row, index) => {
          document
            .font(index === cityRowIndex ? 'Arial-Bold' : 'Arial')
            .fontSize(8);
          const rowHeight = document.heightOfString(row, {
            width: textWidth,
            lineGap: 1,
          });
          document.text(row, textX, headerTextY, {
            width: textWidth,
            align: alignment,
            lineGap: 1,
          });
          headerTextY += rowHeight + 1;
        });

        const headerBottom = Math.max(
          headerTop + REJECTION_LETTER_LOGO_SIZE_PT.height + 8,
          headerTextY + 3,
        );
        if (
          headerBottom + 14 >
          document.page.height - document.page.margins.bottom
        ) {
          throw new Error('Kop surat terlalu panjang untuk satu halaman');
        }
        document
          .strokeColor('#111111')
          .lineWidth(1.3)
          .moveTo(left, headerBottom)
          .lineTo(right, headerBottom)
          .stroke();
        document
          .lineWidth(0.5)
          .moveTo(left, headerBottom + 3)
          .lineTo(right, headerBottom + 3)
          .stroke();
        document.x = left;
        document.y = headerBottom + 14;
        return;
      }

      if (block === 'TITLE') {
        document
          .font('Arial-Bold')
          .fontSize(12)
          .text(draft.title, { align: alignment });
        document.moveDown(1.2);
        return;
      }

      if (block === 'DATE') {
        // The city is shown in the letterhead; the signing block has no date line.
        return;
      }

      if (block === 'LETTER_META') {
        document.font('Arial').fontSize(layoutConfig.bodyFontSizePt);
        document.text(`Nomor    : ${draft.number}`, { align: alignment });
        document.text('Sifat       : Biasa', { align: alignment });
        document.text('Lampiran : -', { align: alignment });
        document.text(`Hal         : ${draft.subject}`, { align: alignment });
        document.moveDown(0.9);
        return;
      }

      if (block === 'RECIPIENT') {
        document.font('Arial').fontSize(layoutConfig.bodyFontSizePt);
        document.text('Yth.', { align: alignment });
        draft.recipientLines.forEach((line) =>
          document.text(line, { align: alignment }),
        );
        document.moveDown(0.9);
        document.text('Dengan hormat,', { align: alignment });
        document.moveDown(0.7);
        return;
      }

      if (block === 'BODY') {
        document
          .font('Arial')
          .fontSize(layoutConfig.bodyFontSizePt)
          .fillColor('#111111');
        draft.body.split('\n\n').forEach((paragraph) => {
          document.text(paragraph, {
            align: alignment,
            lineGap: layoutConfig.bodyLineGapPt,
          });
          document.moveDown(
            layoutConfig.paragraphSpacingPt / layoutConfig.bodyFontSizePt,
          );
        });
        if (
          !draft.localTestPresentation &&
          shouldRenderRejectionFindingsSeparately(draft.body, draft.findings)
        ) {
          document
            .font('Arial-Bold')
            .text('Alasan penolakan', { align: alignment });
          document.moveDown(0.35);
          document.font('Arial');
          renderFindingList(
            document,
            draft.findings,
            layoutConfig.bodyLineGapPt,
            alignment,
          );
          document.moveDown(0.8);
        }
        return;
      }

      if (block === 'CLOSING') {
        document
          .font('Arial')
          .fontSize(layoutConfig.bodyFontSizePt)
          .text(draft.closing, {
            align: alignment,
            lineGap: layoutConfig.bodyLineGapPt,
          });
        document.moveDown(0.8);
        return;
      }

      const signatureHeight = draft.verificationQrPng ? 180 : 115;
      if (
        document.y + signatureHeight >
        document.page.height - document.page.margins.bottom
      ) {
        document.addPage();
      }
      const signatureWidth = Math.min(230, right - left);
      const signatureX =
        alignment === 'left'
          ? left
          : alignment === 'center'
            ? left + (right - left - signatureWidth) / 2
            : right - signatureWidth;
      const signatureY = document.y;
      if (draft.verificationQrPng) {
        document.font('Arial-Bold').fontSize(9.5);
        const position = draft.signatureLines[1] ?? '';
        const positionWidth = Math.min(
          signatureWidth,
          document.widthOfString(position),
        );
        const positionTextX =
          alignment === 'right'
            ? signatureX + signatureWidth - positionWidth
            : alignment === 'center'
              ? signatureX + (signatureWidth - positionWidth) / 2
              : signatureX;
        document.text(position, signatureX, signatureY, {
          width: signatureWidth,
          align: alignment,
        });
        const qrY = Math.max(signatureY + 16, document.y + 4);
        const qrSize = 90;
        const qrX = Math.max(
          left,
          Math.min(
            right - qrSize,
            positionTextX + (positionWidth - qrSize) / 2,
          ),
        );
        document.image(draft.verificationQrPng, qrX, qrY, {
          width: qrSize,
          height: qrSize,
        });
        document
          .font('Arial-Bold')
          .fontSize(10)
          .text(draft.signatureLines[2] ?? '', signatureX, qrY + 92, {
            width: signatureWidth,
            align: alignment,
          });
        const hasRankLine = draft.signatureLines.length >= 5;
        const rank = hasRankLine ? (draft.signatureLines[3] ?? '').trim() : '';
        const identity =
          (hasRankLine
            ? draft.signatureLines[4]
            : draft.signatureLines[3]
          )?.trim() ?? '';
        if (rank) {
          document
            .font('Arial')
            .fontSize(9)
            .text(rank, signatureX, document.y + 2, {
              width: signatureWidth,
              align: alignment,
            });
        }
        if (identity) {
          document
            .font('Arial')
            .fontSize(9)
            .text(
              /^\d[\d\s]*$/.test(identity) ? `NIP. ${identity}` : identity,
              signatureX,
              document.y + 3,
              { width: signatureWidth, align: alignment },
            );
        }
        document
          .font('Arial')
          .fontSize(7)
          .text(
            'Pindai QR untuk memeriksa status dokumen',
            signatureX,
            Math.max(qrY + 132, document.y + 8),
            { width: signatureWidth, align: alignment },
          );
      } else {
        document
          .font('Arial')
          .text(draft.signatureLines[1] ?? '', signatureX, signatureY, {
            width: signatureWidth,
            align: alignment,
          });
        document.moveDown(2.8);
        document
          .font('Arial-Bold')
          .text(draft.signatureLines[2] ?? '', signatureX, document.y, {
            width: signatureWidth,
            align: alignment,
          });
        const hasRankLine = draft.signatureLines.length >= 5;
        const rank = hasRankLine ? (draft.signatureLines[3] ?? '').trim() : '';
        const identity =
          (hasRankLine
            ? draft.signatureLines[4]
            : draft.signatureLines[3]
          )?.trim() ?? '';
        if (rank) {
          document.font('Arial').text(rank, signatureX, document.y, {
            width: signatureWidth,
            align: alignment,
          });
        }
        if (identity) {
          document.font('Arial').text(identity, signatureX, document.y, {
            width: signatureWidth,
            align: alignment,
          });
        }
      }
    };

    for (const block of layoutConfig.blockOrder) renderBlock(block);

    document.end();
  });
}

export function rejectionLetterFileName(applicationNumber: string): string {
  const normalized = applicationNumber
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${normalized || 'rekomtek'}-surat-penolakan.pdf`;
}
