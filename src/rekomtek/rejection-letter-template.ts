import {
  RejectionLetterDraft,
  RejectionLetterFinding,
} from './rekomtek-rejection-letter';
import {
  RejectionLetterLayoutConfig,
  resolveRejectionLetterLayoutConfig,
} from './rejection-letter-layout';

export interface RejectionLetterTemplateSnapshot {
  rekomtekType?: string;
  jenisPermohonan?: string;
  version?: number;
  subjectTemplate: string;
  bodyTemplate: string;
  closingTemplate: string;
  layoutConfig?: RejectionLetterLayoutConfig;
}

export interface RejectionLetterSettingsSnapshot {
  institutionName: string;
  institutionAddress?: string | null;
  institutionPhoneFax?: string | null;
  institutionEmail?: string | null;
  institutionWebsite?: string | null;
  issueCity: string;
  signatoryName: string;
  signatoryPosition: string;
  activeHeadRank?: string | null;
  signatoryNip?: string | null;
}

export interface ConfiguredRejectionLetterInput {
  applicantName: string;
  applicantOrganization?: string | null;
  applicantAddress?: string | null;
  applicationNumber: string;
  applicationTitle: string;
  applicationType: string;
  evaluationSummary: string;
  findings: RejectionLetterFinding[];
  template: RejectionLetterTemplateSnapshot;
  settings: RejectionLetterSettingsSnapshot;
  outgoingNumber: string;
  outgoingDate: Date;
}

const REQUIRED_BODY_FIELDS = [
  'companyName',
  'applicationNumber',
  'applicationTitle',
  'applicationType',
  'evaluationSummary',
  'rejectionReasons',
] as const;

const TEMPLATE_FIELDS = [
  'applicantName',
  'companyName',
  'applicantAddress',
  'applicationNumber',
  'applicationTitle',
  'applicationType',
  'evaluationSummary',
  'rejectionReasons',
  'letterNumber',
  'letterDate',
  'city',
  'institutionName',
  'institutionAddress',
  'signatoryName',
  'signatoryPosition',
  'signatoryNip',
] as const;

function dateInJakarta(value: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeZone: 'Asia/Jakarta',
  }).format(value);
}

function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  const unknown = [...template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
    .map((match) => match[1])
    .filter((key) => !(key in values));
  if (unknown.length) {
    throw new Error('Template surat memuat variabel yang tidak didukung');
  }
  const rendered = template.replace(
    /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g,
    (_match, key: string) => values[key] ?? '',
  );
  if (/\{\{|\}\}/.test(rendered)) {
    throw new Error('Template surat memuat variabel yang tidak didukung');
  }
  return rendered.trim();
}

export function validateRejectionLetterTemplate(
  template: RejectionLetterTemplateSnapshot,
): void {
  resolveRejectionLetterLayoutConfig(template.layoutConfig);
  for (const field of REQUIRED_BODY_FIELDS) {
    if (!template.bodyTemplate.includes(`{{${field}}}`)) {
      throw new Error(`Template surat wajib memuat variabel {{${field}}}`);
    }
  }
  if (!template.subjectTemplate.includes('{{applicationNumber}}')) {
    throw new Error('Template perihal wajib memuat {{applicationNumber}}');
  }
  if (!template.closingTemplate.includes('{{signatoryName}}')) {
    throw new Error('Template penutup wajib memuat {{signatoryName}}');
  }
  const values = Object.fromEntries(
    TEMPLATE_FIELDS.map((field) => [field, '']),
  );
  renderTemplate(template.subjectTemplate, values);
  renderTemplate(template.bodyTemplate, values);
  renderTemplate(template.closingTemplate, values);
}

export function buildConfiguredRejectionLetterDraft(
  input: ConfiguredRejectionLetterInput,
): RejectionLetterDraft {
  const companyName =
    input.applicantOrganization?.replace(/\s+/g, ' ').trim() ||
    input.applicantName.replace(/\s+/g, ' ').trim();
  const findings = input.findings.map((finding) => ({
    requirement: finding.requirement.replace(/\s+/g, ' ').trim(),
    note: finding.note.replace(/\s+/g, ' ').trim(),
  }));
  if (
    !companyName ||
    !input.applicationNumber.trim() ||
    !input.applicationTitle.trim() ||
    !input.applicationType.trim() ||
    !input.evaluationSummary.trim() ||
    findings.length === 0 ||
    findings.some((finding) => !finding.requirement || !finding.note)
  ) {
    throw new Error('Data pemohon atau evaluasi ulang belum lengkap');
  }
  if (
    !input.settings.institutionName.trim() ||
    !input.settings.issueCity.trim() ||
    !input.settings.signatoryName.trim() ||
    !input.settings.signatoryPosition.trim() ||
    !input.outgoingNumber.trim()
  ) {
    throw new Error('Pengaturan surat resmi atau pejabat belum lengkap');
  }
  validateRejectionLetterTemplate(input.template);

  const letterDate = dateInJakarta(input.outgoingDate);
  const rejectionReasons = findings
    .map(
      (finding, index) =>
        `${index + 1}. ${finding.requirement}: ${finding.note}`,
    )
    .join('\n');
  const values = {
    applicantName: input.applicantName.trim(),
    companyName,
    applicantAddress: input.applicantAddress?.trim() ?? '',
    applicationNumber: input.applicationNumber.trim(),
    applicationTitle: input.applicationTitle.trim(),
    applicationType: input.applicationType.trim(),
    evaluationSummary: input.evaluationSummary.trim(),
    rejectionReasons,
    letterNumber: input.outgoingNumber.trim(),
    letterDate,
    city: input.settings.issueCity.trim(),
    institutionName: input.settings.institutionName.trim(),
    institutionAddress: input.settings.institutionAddress?.trim() ?? '',
    signatoryName: input.settings.signatoryName.trim(),
    signatoryPosition: input.settings.signatoryPosition.trim(),
    signatoryNip: input.settings.signatoryNip?.trim() ?? '',
  };
  const subject = renderTemplate(input.template.subjectTemplate, values);
  const body = renderTemplate(input.template.bodyTemplate, values);
  const closing = renderTemplate(input.template.closingTemplate, values);
  if (!subject || !body || !closing) {
    throw new Error('Template surat resmi belum lengkap');
  }

  return {
    institution: values.institutionName,
    institutionAddress: values.institutionAddress,
    institutionPhoneFax:
      input.settings.institutionPhoneFax?.trim() || undefined,
    institutionEmail: input.settings.institutionEmail?.trim() || undefined,
    institutionWebsite: input.settings.institutionWebsite?.trim() || undefined,
    issueCity: values.city,
    title: 'SURAT PENOLAKAN PERMOHONAN REKOMENDASI TEKNIS',
    number: values.letterNumber,
    subject,
    recipientLines: [
      companyName,
      ...(input.applicantAddress?.trim()
        ? [input.applicantAddress.trim()]
        : []),
      'di Tempat',
    ],
    applicationNumber: values.applicationNumber,
    applicationTitle: values.applicationTitle,
    applicationType: values.applicationType,
    evaluationSummary: values.evaluationSummary,
    findings,
    body,
    disclaimer:
      'PRATINJAU INTERNAL — BELUM DITANDATANGANI DAN BELUM DITERBITKAN. Nama pejabat yang tercantum hanya identitas rencana penandatangan, bukan tanda tangan elektronik.',
    closing,
    layoutConfig: resolveRejectionLetterLayoutConfig(
      input.template.layoutConfig,
    ),
    signatureLines: [
      '',
      values.signatoryPosition,
      values.signatoryName,
      input.settings.activeHeadRank?.trim() || '',
      values.signatoryNip,
    ],
    letterDate: `${values.city}, ${letterDate}`,
  };
}
