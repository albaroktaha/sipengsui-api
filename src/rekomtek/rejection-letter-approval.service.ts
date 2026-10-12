import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BerkasTechnicalStatus,
  Prisma,
  RejectionLetterIssuanceMethod,
  RejectionLetterJobStatus,
  RejectionLetterSettings,
  RekomtekArtifactStatus,
  RekomtekArtifactType,
  RekomtekWorkflowStage,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertRejectionLetterApprover,
  assertRejectionLetterSettingsManager,
  missingRejectionLetterSettingFields,
  normalizeOfficialVerificationDomain,
  assertRejectionLetterAuthorityIsCurrent,
  assessRejectionLetterQrReadiness,
} from './rejection-letter-approval-policy';
import {
  ApproveRejectionLetterDto,
  SaveRejectionLetterSettingsDto,
} from './dto/rejection-letter.dto';
import { validateRejectionLetterTemplate } from './rejection-letter-template';
import {
  buildConfiguredRejectionLetterDraft,
  RejectionLetterTemplateSnapshot,
} from './rejection-letter-template';
import { resolveRejectionLetterLayoutConfig } from './rejection-letter-layout';
import {
  getRejectionLetterPeriodKey,
  renderRejectionLetterNumber,
} from './rejection-letter-number';
import {
  buildRejectionLetterVerificationUrl,
  createRejectionLetterQrPng,
} from './rejection-letter-qr';
import {
  createRejectionLetterVerificationToken,
  hashRejectionLetterVerificationToken,
} from './rejection-letter-token';
import { verifyRejectionLetterFile } from './rejection-letter-verification';
import {
  assertRejectionLetterFontsAvailable,
  buildRejectionLetterDraft,
  rejectionLetterFileName,
  renderRejectionLetterPdf,
} from './rekomtek-rejection-letter';
import { BerkasFileStorageService } from './berkas-file-storage.service';
import { decodeRejectionLetterLogo } from './rejection-letter-logo';
import { RekomtekWorkflowService } from './rekomtek-workflow.service';

function jsonRecord(
  value: Prisma.JsonValue | null,
): Record<string, Prisma.JsonValue> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, Prisma.JsonValue>;
  }
  return {};
}

function snapshotString(
  record: Record<string, Prisma.JsonValue>,
  key: string,
  fallback?: string,
): string {
  const value = record[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (fallback?.trim()) return fallback.trim();
  throw new BadRequestException(`Snapshot surat tidak memuat ${key}`);
}

export function publicRejectionLetterSubject(
  subject: string,
  applicantSnapshot: Prisma.JsonValue | null,
): string {
  const applicant = jsonRecord(applicantSnapshot);
  const privateValues = [
    applicant.applicantName,
    applicant.applicantOrganization,
    applicant.applicantAddress,
  ].filter(
    (value): value is string => typeof value === 'string' && !!value.trim(),
  );
  return privateValues
    .sort((left, right) => right.length - left.length)
    .reduce((result, value) => result.split(value).join('Pemohon'), subject)
    .replace(/\s+/g, ' ')
    .trim();
}

function isAuthorizedLocalTestBackfill(job: {
  status: RejectionLetterJobStatus;
  approvedAt: Date | null;
  issuedAt: Date | null;
  outgoingNumber: string | null;
  preparedPdfStorageKey: string | null;
  preparedPdfChecksum: string | null;
  evaluationSnapshot: Prisma.JsonValue | null;
  events?: Array<{ action: string }>;
}): boolean {
  const evaluation = jsonRecord(job.evaluationSnapshot);
  return (
    job.status === RejectionLetterJobStatus.BLOCKED_TTE &&
    Boolean(job.approvedAt) &&
    !job.issuedAt &&
    Boolean(job.outgoingNumber?.trim()) &&
    Boolean(job.preparedPdfStorageKey && job.preparedPdfChecksum) &&
    evaluation.summarySource ===
      'USER_AUTHORIZED_LOCAL_TEST_BACKFILL_NOT_ORIGINAL' &&
    Boolean(
      job.events?.some(
        (event) => event.action === 'BACKFILL_LOCAL_TEST_REJECTION_JOB',
      ),
    )
  );
}

function getLocalQrTestOrigin(configuredUrl: string | undefined): string {
  let url: URL;
  try {
    url = new URL(configuredUrl?.trim() || 'http://localhost:3001');
  } catch {
    throw new ForbiddenException('APP_URL uji QR harus menunjuk ke localhost');
  }
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new ForbiddenException(
      'APP_URL uji QR harus berupa origin localhost tanpa path atau kredensial',
    );
  }
  return url.origin;
}

type CompleteSettingsKey =
  | 'institutionName'
  | 'institutionAddress'
  | 'issueCity'
  | 'verificationDomain'
  | 'outgoingNumberFormat'
  | 'classificationCode'
  | 'agendaSource'
  | 'agendaScope'
  | 'initialLastNumber'
  | 'numberResetRule'
  | 'activeHeadUserId'
  | 'activeHeadName'
  | 'activeHeadPosition'
  | 'authorityStartsAt'
  | 'authorityEndsAt';

type CompleteRejectionLetterSettings = Omit<
  RejectionLetterSettings,
  CompleteSettingsKey
> & {
  [Key in CompleteSettingsKey]-?: NonNullable<RejectionLetterSettings[Key]>;
};

function assertSettingsComplete(
  settings: RejectionLetterSettings | null,
): asserts settings is CompleteRejectionLetterSettings {
  const missing = missingRejectionLetterSettingFields(settings);
  if (missing.length) {
    throw new BadRequestException(
      `Pengaturan surat belum lengkap: ${missing.join(', ')}`,
    );
  }
}

@Injectable()
export class RejectionLetterApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly fileStorage?: BerkasFileStorageService,
    @Optional() private readonly workflowService?: RekomtekWorkflowService,
  ) {}

  private async assertCurrentHead(
    user: AuthenticatedUser,
    activeHeadUserId: string | null | undefined,
  ) {
    assertRejectionLetterApprover(user, activeHeadUserId);
    const activeHead = await this.prisma.user.findFirst({
      where: {
        id: user.userId,
        isActive: true,
        OR: [
          { role: { name: 'PIMPINAN' } },
          { userRoles: { some: { role: { name: 'PIMPINAN' } } } },
        ],
        userPermissions: {
          some: { permission: { slug: 'rekomtek.approve.final' } },
        },
      },
      select: { id: true },
    });
    if (!activeHead || activeHead.id !== activeHeadUserId) {
      throw new ForbiddenException(
        'Kepala Bidang aktif tidak lagi memiliki akses persetujuan',
      );
    }
  }

  async listEligibleHeads(user: AuthenticatedUser) {
    assertRejectionLetterSettingsManager(user);
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { role: { name: 'PIMPINAN' } },
          { userRoles: { some: { role: { name: 'PIMPINAN' } } } },
        ],
        userPermissions: {
          some: { permission: { slug: 'rekomtek.approve.final' } },
        },
      },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async getSettings(user: AuthenticatedUser) {
    assertRejectionLetterSettingsManager(user);
    const [settings, templates] = await Promise.all([
      this.prisma.rejectionLetterSettings.findUnique({
        where: { id: 'default' },
      }),
      this.prisma.rejectionLetterTemplate.findMany({
        where: { isActive: true },
        orderBy: [{ rekomtekType: 'asc' }, { jenisPermohonan: 'asc' }],
      }),
    ]);
    const missingFields = missingRejectionLetterSettingFields(settings);
    const activeHead = settings?.activeHeadUserId
      ? await this.prisma.user.findFirst({
          where: {
            id: settings.activeHeadUserId,
            isActive: true,
            OR: [
              { role: { name: 'PIMPINAN' } },
              { userRoles: { some: { role: { name: 'PIMPINAN' } } } },
            ],
            userPermissions: {
              some: { permission: { slug: 'rekomtek.approve.final' } },
            },
          },
          select: { id: true },
        })
      : null;

    let authorityCurrent = false;
    if (settings) {
      try {
        assertRejectionLetterAuthorityIsCurrent(settings, new Date());
        authorityCurrent = true;
      } catch {
        authorityCurrent = false;
      }
    }

    let verificationOriginMatches = false;
    try {
      const appUrl = process.env.APP_URL;
      const appHost = appUrl ? new URL(appUrl).hostname : '';
      verificationOriginMatches = Boolean(
        appUrl &&
        settings?.verificationDomain &&
        normalizeOfficialVerificationDomain(appUrl) ===
          normalizeOfficialVerificationDomain(settings.verificationDomain) &&
        isIP(appHost.replace(/^\[|\]$/g, '')) === 0 &&
        !/(^|\.)(localhost|local)$/i.test(appHost),
      );
    } catch {
      verificationOriginMatches = false;
    }

    let arialFontsAvailable = false;
    try {
      assertRejectionLetterFontsAvailable();
      arialFontsAvailable = true;
    } catch {
      arialFontsAvailable = false;
    }

    const readiness = assessRejectionLetterQrReadiness({
      settingsComplete: missingFields.length === 0,
      logoAndNipPresent: Boolean(
        decodeRejectionLetterLogo(settings?.logoDataUrl) &&
        settings?.activeHeadNip?.trim(),
      ),
      authorityCurrent,
      activeHeadEligible: Boolean(activeHead),
      verificationOriginMatches,
      activeTemplateAvailable: templates.length > 0,
      arialFontsAvailable,
    });
    return {
      settings,
      templates,
      missingFields,
      qrIssuanceReadiness: readiness,
      signingEnabled: false,
      publishingEnabled: false,
      activationStatus:
        'TTE dinonaktifkan. Penerbitan surat resmi ber-QR hanya tersedia dari antrean persetujuan Kepala Bidang setelah seluruh prasyarat runtime lulus.',
    };
  }

  async saveSettings(
    dto: SaveRejectionLetterSettingsDto,
    user: AuthenticatedUser,
  ) {
    assertRejectionLetterSettingsManager(user);
    const verificationDomain = normalizeOfficialVerificationDomain(
      dto.verificationDomain,
    );
    if (dto.logoDataUrl && !decodeRejectionLetterLogo(dto.logoDataUrl)) {
      throw new BadRequestException(
        'Logo hanya boleh berupa PNG atau JPEG yang valid',
      );
    }
    if (new Date(dto.authorityStartsAt) > new Date(dto.authorityEndsAt)) {
      throw new BadRequestException(
        'Masa kewenangan Kepala Bidang tidak valid',
      );
    }
    const templateKeys = new Set<string>();
    for (const template of dto.templates) {
      validateRejectionLetterTemplate({
        ...template,
        layoutConfig: resolveRejectionLetterLayoutConfig(template.layoutConfig),
      });
      const key = `${template.rekomtekType}|${template.jenisPermohonan}`;
      if (templateKeys.has(key)) {
        throw new BadRequestException(
          'Template surat untuk jenis yang sama tidak boleh ganda',
        );
      }
      templateKeys.add(key);
    }
    const activeHead = await this.prisma.user.findFirst({
      where: {
        id: dto.activeHeadUserId,
        isActive: true,
        OR: [
          { role: { name: 'PIMPINAN' } },
          { userRoles: { some: { role: { name: 'PIMPINAN' } } } },
        ],
        userPermissions: {
          some: { permission: { slug: 'rekomtek.approve.final' } },
        },
      },
      select: { id: true },
    });
    if (!activeHead) {
      throw new BadRequestException(
        'Kepala Bidang harus aktif, ber-role PIMPINAN, dan memiliki permission rekomtek.approve.final',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.rejectionLetterSettings.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          institutionName: dto.institutionName.trim(),
          institutionAddress: dto.institutionAddress.trim(),
          issueCity: dto.issueCity.trim(),
          logoDataUrl: dto.logoDataUrl || null,
          verificationDomain,
          outgoingNumberFormat: dto.outgoingNumberFormat.trim(),
          classificationCode: dto.classificationCode.trim(),
          agendaSource: dto.agendaSource.trim(),
          agendaScope: dto.agendaScope.trim(),
          initialLastNumber: dto.initialLastNumber,
          numberResetRule: dto.numberResetRule as never,
          activeHeadUserId: dto.activeHeadUserId,
          activeHeadName: dto.activeHeadName.trim(),
          activeHeadPosition: dto.activeHeadPosition.trim(),
          activeHeadNip: dto.activeHeadNip?.trim() || null,
          authorityStartsAt: new Date(dto.authorityStartsAt),
          authorityEndsAt: new Date(dto.authorityEndsAt),
          certificateIdentity: dto.certificateIdentity?.trim() || null,
          updatedById: user.userId,
          version: 1,
        },
        update: {
          institutionName: dto.institutionName.trim(),
          institutionAddress: dto.institutionAddress.trim(),
          issueCity: dto.issueCity.trim(),
          logoDataUrl: dto.logoDataUrl || null,
          verificationDomain,
          outgoingNumberFormat: dto.outgoingNumberFormat.trim(),
          classificationCode: dto.classificationCode.trim(),
          agendaSource: dto.agendaSource.trim(),
          agendaScope: dto.agendaScope.trim(),
          initialLastNumber: dto.initialLastNumber,
          numberResetRule: dto.numberResetRule as never,
          activeHeadUserId: dto.activeHeadUserId,
          activeHeadName: dto.activeHeadName.trim(),
          activeHeadPosition: dto.activeHeadPosition.trim(),
          activeHeadNip: dto.activeHeadNip?.trim() || null,
          authorityStartsAt: new Date(dto.authorityStartsAt),
          authorityEndsAt: new Date(dto.authorityEndsAt),
          certificateIdentity: dto.certificateIdentity?.trim() || null,
          updatedById: user.userId,
          version: { increment: 1 },
        },
      });
      for (const template of dto.templates) {
        const previous = await tx.rejectionLetterTemplate.findFirst({
          where: {
            rekomtekType: template.rekomtekType,
            jenisPermohonan: template.jenisPermohonan as never,
          },
          orderBy: { version: 'desc' },
        });
        if (previous) {
          const waitingJobs = await tx.rejectionLetterJob.findMany({
            where: {
              status: RejectionLetterJobStatus.WAITING_APPROVAL,
              rekomtek: {
                jenis: template.rekomtekType,
                jenisPermohonan: template.jenisPermohonan as never,
              },
            },
            select: { id: true, updatedAt: true, templateSnapshot: true },
          });
          for (const job of waitingJobs) {
            if (job.templateSnapshot !== null) continue;
            const pinned = await tx.rejectionLetterJob.updateMany({
              where: {
                id: job.id,
                status: RejectionLetterJobStatus.WAITING_APPROVAL,
                updatedAt: job.updatedAt,
              },
              data: {
                templateSnapshot: {
                  rekomtekType: previous.rekomtekType,
                  jenisPermohonan: previous.jenisPermohonan,
                  version: previous.version,
                  subjectTemplate: previous.subjectTemplate,
                  bodyTemplate: previous.bodyTemplate,
                  closingTemplate: previous.closingTemplate,
                  layoutConfig: resolveRejectionLetterLayoutConfig(
                    previous.layoutConfig,
                  ),
                } as unknown as Prisma.InputJsonValue,
              },
            });
            if (pinned.count !== 1) {
              throw new ConflictException(
                'Antrean persetujuan berubah saat versi template diperbarui. Muat ulang, lalu simpan kembali.',
              );
            }
          }
        }
        await tx.rejectionLetterTemplate.updateMany({
          where: {
            rekomtekType: template.rekomtekType,
            jenisPermohonan: template.jenisPermohonan as never,
            isActive: true,
          },
          data: { isActive: false },
        });
        await tx.rejectionLetterTemplate.create({
          data: {
            rekomtekType: template.rekomtekType,
            jenisPermohonan: template.jenisPermohonan as never,
            version: (previous?.version ?? 0) + 1,
            subjectTemplate: template.subjectTemplate.trim(),
            bodyTemplate: template.bodyTemplate.trim(),
            closingTemplate: template.closingTemplate.trim(),
            layoutConfig: resolveRejectionLetterLayoutConfig(
              template.layoutConfig ?? previous?.layoutConfig,
            ) as unknown as Prisma.InputJsonValue,
            createdById: user.userId,
            isActive: true,
          },
        });
      }
      return {
        settings,
        templateCount: dto.templates.length,
        signingEnabled: false,
        publishingEnabled: false,
      };
    });
  }

  async getApprovalPreview(jobId: string, user: AuthenticatedUser) {
    const settings = await this.prisma.rejectionLetterSettings.findUnique({
      where: { id: 'default' },
    });
    assertSettingsComplete(settings);
    await this.assertCurrentHead(user, settings.activeHeadUserId);
    const now = new Date();
    assertRejectionLetterAuthorityIsCurrent(settings, now);
    normalizeOfficialVerificationDomain(settings.verificationDomain);
    const job = await this.prisma.rejectionLetterJob.findUnique({
      where: { id: jobId },
      include: {
        rekomtek: {
          select: {
            nomor: true,
            judul: true,
            jenis: true,
            jenisPermohonan: true,
          },
        },
        events: { select: { action: true } },
      },
    });
    if (!job)
      throw new NotFoundException('Job surat penolakan tidak ditemukan');
    if (
      job.status === RejectionLetterJobStatus.ISSUED &&
      !job.isTestOnly &&
      job.issuanceMethod === RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR
    ) {
      return {
        id: job.id,
        status: job.status,
        updatedAt: job.updatedAt,
        numberAllocated: true,
        outgoingNumber: job.outgoingNumber,
        preparedPdfAvailable: Boolean(job.finalPdfStorageKey),
        finalPdfAvailable: Boolean(job.finalPdfStorageKey),
        finalPdfChecksum: job.finalPdfChecksum,
        issuanceMethod: job.issuanceMethod,
        isTestOnly: false,
        signingEnabled: false,
        publishingEnabled: false,
      };
    }
    if (
      job.status === RejectionLetterJobStatus.ISSUED &&
      job.isTestOnly &&
      job.issuanceMethod === RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR
    ) {
      return {
        id: job.id,
        status: job.status,
        updatedAt: job.updatedAt,
        numberAllocated: true,
        outgoingNumber: job.outgoingNumber,
        preparedPdfAvailable: Boolean(job.finalPdfStorageKey),
        finalPdfAvailable: Boolean(job.finalPdfStorageKey),
        finalPdfChecksum: job.finalPdfChecksum,
        issuanceMethod: job.issuanceMethod,
        isTestOnly: true,
        testQrPublishAvailable: false,
        signingEnabled: false,
        publishingEnabled: false,
      };
    }
    if (job.status === RejectionLetterJobStatus.BLOCKED_TTE) {
      return {
        id: job.id,
        status: job.status,
        updatedAt: job.updatedAt,
        numberAllocated: true,
        outgoingNumber: job.outgoingNumber,
        preparedPdfAvailable: Boolean(job.preparedPdfStorageKey),
        testQrPublishAvailable:
          process.env.NODE_ENV !== 'production' &&
          isAuthorizedLocalTestBackfill(job),
        signingEnabled: false,
        publishingEnabled: false,
      };
    }
    if (
      job.status === RejectionLetterJobStatus.APPROVED_PREPARING ||
      job.status === RejectionLetterJobStatus.FAILED
    ) {
      return {
        id: job.id,
        status: job.status,
        updatedAt: job.updatedAt,
        numberAllocated: Boolean(job.outgoingNumber),
        outgoingNumber: job.outgoingNumber,
        failureReason: job.failureReason,
        retryAvailable:
          job.status === RejectionLetterJobStatus.FAILED ||
          Boolean(job.processingLeaseUntil && job.processingLeaseUntil <= now),
        signingEnabled: false,
        publishingEnabled: false,
      };
    }
    if (job.status !== RejectionLetterJobStatus.WAITING_APPROVAL) {
      throw new ConflictException(
        'Surat tidak tersedia untuk pratinjau persetujuan',
      );
    }
    const template = job.templateSnapshot
      ? jsonRecord(job.templateSnapshot)
      : await this.prisma.rejectionLetterTemplate.findFirst({
          where: {
            rekomtekType: job.rekomtek.jenis,
            jenisPermohonan: job.rekomtek.jenisPermohonan,
            isActive: true,
          },
          orderBy: { version: 'desc' },
        });
    if (!template) {
      throw new BadRequestException(
        'Template untuk jenis permohonan ini belum tersedia',
      );
    }
    const applicant = jsonRecord(job.applicantSnapshot);
    const evaluation = jsonRecord(job.evaluationSnapshot);
    if (!Array.isArray(evaluation.findings) || !evaluation.findings.length) {
      throw new BadRequestException('Snapshot temuan evaluasi belum tersedia');
    }
    const findings = evaluation.findings.map((value) => {
      const finding = jsonRecord(value);
      return {
        requirement: snapshotString(finding, 'requirement'),
        note: snapshotString(finding, 'note'),
      };
    });
    const draft = buildConfiguredRejectionLetterDraft({
      applicationNumber: snapshotString(
        applicant,
        'applicationNumber',
        job.rekomtek.nomor ?? undefined,
      ),
      applicationTitle: snapshotString(
        applicant,
        'applicationTitle',
        job.rekomtek.judul ?? undefined,
      ),
      applicationType: snapshotString(
        applicant,
        'applicationType',
        `${job.rekomtek.jenis} / ${job.rekomtek.jenisPermohonan}`,
      ),
      applicantName: snapshotString(applicant, 'applicantName'),
      applicantOrganization:
        typeof applicant.applicantOrganization === 'string'
          ? applicant.applicantOrganization
          : undefined,
      applicantAddress:
        typeof applicant.applicantAddress === 'string'
          ? applicant.applicantAddress
          : undefined,
      evaluationSummary: snapshotString(evaluation, 'summary'),
      findings,
      outgoingNumber: 'Dialokasikan setelah persetujuan',
      outgoingDate: now,
      settings: {
        institutionName: settings.institutionName,
        institutionAddress: settings.institutionAddress,
        issueCity: settings.issueCity,
        signatoryName: settings.activeHeadName,
        signatoryPosition: settings.activeHeadPosition,
        signatoryNip: settings.activeHeadNip ?? undefined,
      },
      template: template as unknown as RejectionLetterTemplateSnapshot,
    });
    return {
      id: job.id,
      status: job.status,
      updatedAt: job.updatedAt,
      numberAllocated: false,
      outgoingNumber: null,
      draft,
      signingEnabled: false,
      publishingEnabled: false,
    };
  }

  async approveAndPreparePreview(
    jobId: string,
    dto: ApproveRejectionLetterDto,
    user: AuthenticatedUser,
  ) {
    const fileStorage = this.fileStorage;
    const workflowService = this.workflowService;
    if (!fileStorage || !workflowService) {
      throw new ConflictException(
        'Penyimpanan atau layanan workflow penerbitan belum tersedia',
      );
    }
    const settings = await this.prisma.rejectionLetterSettings.findUnique({
      where: { id: 'default' },
    });
    assertSettingsComplete(settings);
    await this.assertCurrentHead(user, settings.activeHeadUserId);
    const now = new Date();
    assertRejectionLetterAuthorityIsCurrent(settings, now);
    const verificationDomain = normalizeOfficialVerificationDomain(
      settings.verificationDomain,
    );
    // The QR must resolve on the same public site that serves its verifier.
    const appUrl = process.env.APP_URL;
    if (
      !appUrl ||
      normalizeOfficialVerificationDomain(appUrl) !== verificationDomain ||
      isIP(new URL(appUrl).hostname.replace(/^\[|\]$/g, '')) !== 0 ||
      /(^|\.)(localhost|local)$/i.test(new URL(appUrl).hostname)
    ) {
      throw new ForbiddenException(
        'APP_URL harus sama dengan domain verifikasi HTTPS publik',
      );
    }
    const logo = decodeRejectionLetterLogo(settings.logoDataUrl);
    if (!logo || !settings.activeHeadNip?.trim()) {
      throw new BadRequestException(
        'Logo resmi dan NIP Kepala Bidang wajib tersedia',
      );
    }
    if (
      /KODE-UJI|REKOMTEK-UJI/i.test(
        [
          settings.outgoingNumberFormat,
          settings.classificationCode,
          settings.agendaScope,
        ].join(' '),
      )
    ) {
      throw new ForbiddenException(
        'Format nomor uji tidak dapat dipakai untuk penerbitan resmi',
      );
    }
    assertRejectionLetterFontsAvailable();

    const job = await this.prisma.rejectionLetterJob.findUnique({
      where: { id: jobId },
      include: {
        rekomtek: {
          select: {
            nomor: true,
            judul: true,
            jenis: true,
            jenisPermohonan: true,
            workflowStage: true,
          },
        },
        events: { select: { action: true } },
      },
    });
    if (!job)
      throw new NotFoundException('Job surat penolakan tidak ditemukan');
    const evaluation = jsonRecord(job.evaluationSnapshot);
    const oldSettings = jsonRecord(job.settingsSnapshot);
    if (
      job.isTestOnly ||
      evaluation.summarySource ===
        'USER_AUTHORIZED_LOCAL_TEST_BACKFILL_NOT_ORIGINAL' ||
      job.events.some(
        (event) => event.action === 'BACKFILL_LOCAL_TEST_REJECTION_JOB',
      ) ||
      /KODE-UJI|REKOMTEK-UJI/i.test(
        [
          job.outgoingNumber,
          oldSettings.outgoingNumberFormat,
          oldSettings.classificationCode,
          oldSettings.agendaScope,
        ]
          .filter((value): value is string => typeof value === 'string')
          .join(' '),
      )
    ) {
      throw new ForbiddenException(
        'Job uji/backfill tidak dapat diterbitkan sebagai surat resmi',
      );
    }
    const fresh = job.status === RejectionLetterJobStatus.WAITING_APPROVAL;
    const retry =
      job.status === RejectionLetterJobStatus.FAILED ||
      (job.status === RejectionLetterJobStatus.APPROVED_PREPARING &&
        job.processingLeaseUntil &&
        job.processingLeaseUntil <= now);
    if (!fresh && !retry) {
      throw new ConflictException(
        'Surat ini tidak lagi menunggu persetujuan atau sedang diproses',
      );
    }
    if (
      !dto.expectedUpdatedAt ||
      new Date(dto.expectedUpdatedAt).getTime() !== job.updatedAt.getTime()
    ) {
      throw new ConflictException(
        'Pratinjau berubah; muat ulang sebelum menyetujui',
      );
    }
    if (
      job.rekomtek.workflowStage !==
      RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN
    ) {
      throw new ConflictException(
        'Perkara tidak lagi berada pada tahap menunggu surat penolakan',
      );
    }
    if (
      retry &&
      (!job.outgoingNumber ||
        !job.outgoingDate ||
        !job.approvedAt ||
        job.approvedById !== user.userId ||
        job.isTestOnly ||
        job.issuedAt ||
        !job.templateSnapshot ||
        !job.settingsSnapshot ||
        !job.signerSnapshot ||
        /KODE-UJI|REKOMTEK-UJI/i.test(job.outgoingNumber))
    ) {
      throw new ConflictException(
        'Job gagal tidak memenuhi syarat retry resmi',
      );
    }
    const template =
      fresh && !job.templateSnapshot
        ? await this.prisma.rejectionLetterTemplate.findFirst({
            where: {
              rekomtekType: job.rekomtek.jenis,
              jenisPermohonan: job.rekomtek.jenisPermohonan,
              isActive: true,
            },
            orderBy: { version: 'desc' },
          })
        : null;
    if (fresh && !template && !job.templateSnapshot)
      throw new BadRequestException(
        'Template untuk jenis permohonan ini belum tersedia',
      );
    const templateData = job.templateSnapshot
      ? jsonRecord(job.templateSnapshot)
      : template!;

    const rawFindings = evaluation.findings;
    if (!Array.isArray(rawFindings) || !rawFindings.length) {
      throw new BadRequestException('Snapshot temuan evaluasi belum tersedia');
    }
    const findings = rawFindings.map((value) => {
      const finding = jsonRecord(value);
      return {
        requirement: snapshotString(finding, 'requirement'),
        note: snapshotString(finding, 'note'),
      };
    });
    const applicant = jsonRecord(job.applicantSnapshot);
    const letterInput = {
      applicationNumber: snapshotString(
        applicant,
        'applicationNumber',
        job.rekomtek.nomor ?? undefined,
      ),
      applicationTitle: snapshotString(
        applicant,
        'applicationTitle',
        job.rekomtek.judul ?? undefined,
      ),
      applicationType: snapshotString(
        applicant,
        'applicationType',
        `${job.rekomtek.jenis} / ${job.rekomtek.jenisPermohonan}`,
      ),
      applicantName: snapshotString(applicant, 'applicantName'),
      applicantOrganization:
        typeof applicant.applicantOrganization === 'string'
          ? applicant.applicantOrganization
          : undefined,
      applicantAddress:
        typeof applicant.applicantAddress === 'string'
          ? applicant.applicantAddress
          : undefined,
      evaluationSummary: snapshotString(evaluation, 'summary'),
      findings,
    };
    const token = createRejectionLetterVerificationToken();
    const templateSnapshot: RejectionLetterTemplateSnapshot = {
      rekomtekType: snapshotString(
        templateData as Record<string, Prisma.JsonValue>,
        'rekomtekType',
      ),
      jenisPermohonan: snapshotString(
        templateData as Record<string, Prisma.JsonValue>,
        'jenisPermohonan',
      ),
      version:
        typeof templateData.version === 'number'
          ? templateData.version
          : undefined,
      subjectTemplate: snapshotString(
        templateData as Record<string, Prisma.JsonValue>,
        'subjectTemplate',
      ),
      bodyTemplate: snapshotString(
        templateData as Record<string, Prisma.JsonValue>,
        'bodyTemplate',
      ),
      closingTemplate: snapshotString(
        templateData as Record<string, Prisma.JsonValue>,
        'closingTemplate',
      ),
      layoutConfig: resolveRejectionLetterLayoutConfig(
        templateData.layoutConfig,
      ),
    };
    validateRejectionLetterTemplate(templateSnapshot);
    const leaseUntil = new Date(now.getTime() + 5 * 60_000);
    const allocation = await this.prisma.$transaction(async (tx) => {
      // Claim before touching the number register: losing concurrent requests roll back cleanly.
      const claim = await tx.rejectionLetterJob.updateMany({
        where: {
          id: jobId,
          status: job.status,
          updatedAt: job.updatedAt,
          isTestOnly: false,
          issuedAt: null,
          ...(fresh
            ? { outgoingNumber: null }
            : { outgoingNumber: job.outgoingNumber }),
        },
        data: {
          status: RejectionLetterJobStatus.APPROVED_PREPARING,
          verificationTokenHash: token.tokenHash,
          processingLeaseUntil: leaseUntil,
          processingAttempts: { increment: 1 },
          failureReason: null,
        },
      });
      if (claim.count !== 1)
        throw new ConflictException(
          'Persetujuan sudah diproses oleh pengguna lain',
        );
      let outgoingNumber = job.outgoingNumber;
      if (fresh) {
        const priorSequence = await tx.rejectionLetterNumberSequence.findFirst({
          where: { agendaScope: settings.agendaScope },
          select: { id: true },
        });
        const periodKey = getRejectionLetterPeriodKey(
          settings.numberResetRule,
          now,
        );
        const sequence = await tx.rejectionLetterNumberSequence.upsert({
          where: {
            agendaScope_periodKey: {
              agendaScope: settings.agendaScope,
              periodKey,
            },
          },
          create: {
            agendaScope: settings.agendaScope,
            periodKey,
            lastNumber: (priorSequence ? 0 : settings.initialLastNumber) + 1,
          },
          update: { lastNumber: { increment: 1 } },
          select: { lastNumber: true },
        });
        outgoingNumber = renderRejectionLetterNumber({
          format: settings.outgoingNumberFormat,
          classificationCode: settings.classificationCode,
          agendaScope: settings.agendaScope,
          sequence: sequence.lastNumber,
          date: now,
        });
        if (/KODE-UJI|REKOMTEK-UJI/i.test(outgoingNumber)) {
          throw new ForbiddenException(
            'Nomor uji tidak dapat diterbitkan sebagai surat resmi',
          );
        }
        const recorded = await tx.rejectionLetterJob.updateMany({
          where: {
            id: jobId,
            status: RejectionLetterJobStatus.APPROVED_PREPARING,
            verificationTokenHash: token.tokenHash,
          },
          data: {
            approvedById: user.userId,
            approvedAt: now,
            outgoingNumber,
            outgoingDate: now,
            settingsSnapshot: JSON.parse(
              JSON.stringify({ ...settings, verificationDomain }),
            ) as Prisma.InputJsonValue,
            templateSnapshot:
              templateSnapshot as unknown as Prisma.InputJsonValue,
            signerSnapshot: {
              userId: user.userId,
              name: settings.activeHeadName,
              position: settings.activeHeadPosition,
              nip: settings.activeHeadNip,
              authorityStartsAt: settings.authorityStartsAt.toISOString(),
              authorityEndsAt: settings.authorityEndsAt.toISOString(),
            },
            approvalSnapshot: {
              userId: user.userId,
              approvedAt: now.toISOString(),
              name: settings.activeHeadName,
              position: settings.activeHeadPosition,
              method: 'HEAD_APPROVAL_QR',
              testOnly: false,
            },
            signatureVerified: false,
            finalPdfChecksum: null,
          },
        });
        if (recorded.count !== 1) {
          throw new ConflictException(
            'Snapshot persetujuan berubah sebelum nomor dicatat',
          );
        }
      }
      await tx.rejectionLetterJobEvent.create({
        data: {
          jobId,
          action: fresh
            ? 'HEAD_APPROVAL_QR_ACCEPTED'
            : 'HEAD_APPROVAL_QR_RETRY',
          fromStatus: job.status,
          toStatus: RejectionLetterJobStatus.APPROVED_PREPARING,
          actorId: user.userId,
          actorRole: user.role,
          metadata: {
            outgoingNumber,
            issuanceMethod: 'HEAD_APPROVAL_QR',
            isTestOnly: false,
          },
        },
      });
      return {
        outgoingNumber: outgoingNumber!,
        outgoingDate: fresh ? now : job.outgoingDate!,
      };
    });

    let finalPdfStorageKey: string | undefined;
    try {
      const snap = fresh ? settings : oldSettings;
      const signer = fresh
        ? {
            name: settings.activeHeadName,
            position: settings.activeHeadPosition,
            nip: settings.activeHeadNip,
          }
        : jsonRecord(job.signerSnapshot);
      const city = snapshotString(
        snap as Record<string, Prisma.JsonValue>,
        'issueCity',
      );
      const signerName = snapshotString(signer, 'name');
      const signerPosition = snapshotString(signer, 'position');
      const nip = snapshotString(signer, 'nip');
      const snapDomain = normalizeOfficialVerificationDomain(
        snapshotString(
          snap as Record<string, Prisma.JsonValue>,
          'verificationDomain',
        ),
      );
      if (
        snapDomain !== verificationDomain ||
        /KODE-UJI|REKOMTEK-UJI/i.test(
          [snap.outgoingNumberFormat, snap.classificationCode, snap.agendaScope]
            .filter((value): value is string => typeof value === 'string')
            .join(' '),
        )
      ) {
        throw new ForbiddenException(
          'Snapshot penerbitan resmi tidak sesuai domain atau nomor',
        );
      }
      const snapLogo = decodeRejectionLetterLogo(
        typeof snap.logoDataUrl === 'string' ? snap.logoDataUrl : null,
      );
      if (!snapLogo)
        throw new BadRequestException(
          'Logo resmi pada snapshot wajib tersedia',
        );
      const verificationUrl = buildRejectionLetterVerificationUrl(
        verificationDomain,
        token.token,
      );
      const qr = await createRejectionLetterQrPng(verificationUrl);
      const letter = buildConfiguredRejectionLetterDraft({
        ...letterInput,
        outgoingNumber: allocation.outgoingNumber,
        outgoingDate: allocation.outgoingDate,
        settings: {
          institutionName: snapshotString(
            snap as Record<string, Prisma.JsonValue>,
            'institutionName',
          ),
          institutionAddress: snapshotString(
            snap as Record<string, Prisma.JsonValue>,
            'institutionAddress',
          ),
          issueCity: city,
          signatoryName: signerName,
          signatoryPosition: signerPosition,
          signatoryNip: nip,
        },
        template: templateSnapshot,
      });
      letter.closing = letter.closing
        .replaceAll(signerName, '')
        .replace(/[\s,]+$/g, '')
        .trim();
      // QR renderer currently reads [1]=position, [2]=name, [3]=NIP.
      // Keep [0] as the unused date slot until that renderer contract changes.
      letter.disclaimer = '';
      letter.signatureLines = [
        `${city}, ${letter.letterDate ?? ''}`.trim(),
        signerPosition,
        signerName,
        nip,
      ];
      letter.verificationQrPng = qr;
      letter.logoBuffer = snapLogo;
      const pdf = await renderRejectionLetterPdf(letter);
      if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw new ConflictException('PDF final tidak valid');
      }
      finalPdfStorageKey = await fileStorage.storeGeneratedPdf(pdf);
      const storedPdf = await fileStorage.readBuffer(finalPdfStorageKey);
      if (
        storedPdf.subarray(0, 5).toString('ascii') !== '%PDF-' ||
        !storedPdf.equals(pdf)
      ) {
        throw new ConflictException(
          'PDF final tersimpan tidak cocok dengan hasil pembuatan',
        );
      }
      const finalPdfChecksum = createHash('sha256')
        .update(storedPdf)
        .digest('hex');
      const issuedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const update = await tx.rejectionLetterJob.updateMany({
          where: {
            id: jobId,
            status: RejectionLetterJobStatus.APPROVED_PREPARING,
            verificationTokenHash: token.tokenHash,
            issuedAt: null,
            isTestOnly: false,
            outgoingNumber: allocation.outgoingNumber,
          },
          data: {
            status: RejectionLetterJobStatus.ISSUED,
            issuanceMethod: RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR,
            isTestOnly: false,
            issuedAt,
            finalPdfStorageKey,
            finalPdfChecksum,
            approvalSnapshot: {
              userId: user.userId,
              approvedAt:
                job.approvedAt?.toISOString() ??
                allocation.outgoingDate.toISOString(),
              name: signerName,
              position: signerPosition,
              method: 'HEAD_APPROVAL_QR',
              testOnly: false,
              publicSubject: publicRejectionLetterSubject(
                letter.subject,
                job.applicantSnapshot,
              ),
              documentType: 'SURAT PENOLAKAN',
            },
            signatureVerified: false,
            processingLeaseUntil: null,
            failureReason: null,
          },
        });
        if (update.count !== 1)
          throw new ConflictException('Job berubah bersamaan saat penerbitan');
        await workflowService.transitionRejectionToIssuedInTransaction(
          tx,
          job.rekomtekId,
          user,
          {
            issuanceMethod: 'HEAD_APPROVAL_QR',
            jobId,
            isTestOnly: false,
            finalPdfChecksum,
          },
        );
        const latestArtifact = await tx.rekomtekArtifact.aggregate({
          where: {
            rekomtekId: job.rekomtekId,
            type: RekomtekArtifactType.SURAT_PENOLAKAN,
          },
          _max: { version: true },
        });
        await tx.rekomtekArtifact.create({
          data: {
            rekomtekId: job.rekomtekId,
            type: RekomtekArtifactType.SURAT_PENOLAKAN,
            version: (latestArtifact._max.version ?? 0) + 1,
            fileName: rejectionLetterFileName(letterInput.applicationNumber),
            storageKey: finalPdfStorageKey!,
            mimeType: 'application/pdf',
            fileSize: storedPdf.length,
            checksum: finalPdfChecksum,
            technicalStatus: BerkasTechnicalStatus.VALID,
            stage: RekomtekWorkflowStage.DITOLAK,
            status: RekomtekArtifactStatus.FINAL,
            createdById: user.userId,
            finalizedById: user.userId,
            finalizedAt: issuedAt,
            metadata: {
              issuanceMethod: 'HEAD_APPROVAL_QR',
              isTestOnly: false,
              sourceJobId: jobId,
            },
          },
        });
        await tx.rejectionLetterJobEvent.create({
          data: {
            jobId,
            action: 'HEAD_APPROVAL_QR_ISSUED',
            fromStatus: RejectionLetterJobStatus.APPROVED_PREPARING,
            toStatus: RejectionLetterJobStatus.ISSUED,
            actorId: user.userId,
            actorRole: user.role,
            metadata: {
              outgoingNumber: allocation.outgoingNumber,
              finalPdfChecksum,
              issuanceMethod: 'HEAD_APPROVAL_QR',
              isTestOnly: false,
            },
          },
        });
      });
      return {
        id: jobId,
        status: RejectionLetterJobStatus.ISSUED,
        issuanceMethod: RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR,
        isTestOnly: false,
        outgoingNumber: allocation.outgoingNumber,
        outgoingDate: allocation.outgoingDate,
        issuedAt,
        finalPdfChecksum,
        finalPdfAvailable: true,
        notificationQueued: true,
        notificationSent: false,
        signingEnabled: false,
      };
    } catch (error) {
      // A crash or rollback keeps the allocated number: only the same job may retry.
      // A failed final commit must not erase a file that may already be referenced.
      try {
        const failed = await this.prisma.rejectionLetterJob.updateMany({
          where: {
            id: jobId,
            status: RejectionLetterJobStatus.APPROVED_PREPARING,
            verificationTokenHash: token.tokenHash,
            issuedAt: null,
          },
          data: {
            status: RejectionLetterJobStatus.FAILED,
            failureReason:
              error instanceof Error
                ? error.message.slice(0, 1000)
                : 'Gagal membuat surat final',
            processingLeaseUntil: null,
          },
        });
        if (failed.count === 1) {
          await this.prisma.rejectionLetterJobEvent.create({
            data: {
              jobId,
              action: 'HEAD_APPROVAL_QR_FAILED',
              fromStatus: RejectionLetterJobStatus.APPROVED_PREPARING,
              toStatus: RejectionLetterJobStatus.FAILED,
              actorId: user.userId,
              actorRole: user.role,
              metadata: { outgoingNumber: allocation.outgoingNumber },
            },
          });
        }
      } catch {
        /* Keep the original failure; lease expiry permits recovery. */
      }
      if (finalPdfStorageKey) {
        try {
          const current = await this.prisma.rejectionLetterJob.findUnique({
            where: { id: jobId },
            select: { finalPdfStorageKey: true },
          });
          if (current && current.finalPdfStorageKey !== finalPdfStorageKey) {
            await fileStorage.remove(finalPdfStorageKey);
          }
        } catch {
          /* An unconfirmed commit must never trigger deletion. */
        }
      }
      throw error;
    }
  }

  async publishLocalQrTestJob(jobId: string, user: AuthenticatedUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Penerbitan QR uji lokal tidak tersedia di production',
      );
    }
    const fileStorage = this.fileStorage;
    const workflowService = this.workflowService;
    if (!fileStorage || !workflowService) {
      throw new ConflictException(
        'Penyimpanan atau layanan workflow penerbitan belum tersedia',
      );
    }

    const settings = await this.prisma.rejectionLetterSettings.findUnique({
      where: { id: 'default' },
    });
    assertSettingsComplete(settings);
    await this.assertCurrentHead(user, settings.activeHeadUserId);
    assertRejectionLetterAuthorityIsCurrent(settings, new Date());

    const job = await this.prisma.rejectionLetterJob.findUnique({
      where: { id: jobId },
      include: {
        rekomtek: {
          select: {
            nomor: true,
            judul: true,
            jenis: true,
            jenisPermohonan: true,
            workflowStage: true,
          },
        },
        events: { select: { action: true } },
      },
    });
    if (!job) {
      throw new NotFoundException('Job surat penolakan tidak ditemukan');
    }
    if (!isAuthorizedLocalTestBackfill(job)) {
      throw new ForbiddenException(
        'Aksi ini hanya berlaku untuk job uji lokal hasil backfill yang sudah disetujui',
      );
    }
    if (!job.approvedById || job.approvedById !== user.userId) {
      throw new ForbiddenException(
        'Hanya Kepala Bidang yang sama dengan pencatat persetujuan yang dapat menjalankan uji QR lokal',
      );
    }
    if (
      !job.outgoingDate ||
      !job.rekomtek ||
      job.rekomtek.workflowStage !==
        RekomtekWorkflowStage.PENYUSUNAN_SURAT_PENOLAKAN
    ) {
      throw new ConflictException(
        'Perkara tidak lagi berada pada tahap menunggu surat penolakan',
      );
    }

    const applicant = jsonRecord(job.applicantSnapshot);
    const evaluation = jsonRecord(job.evaluationSnapshot);
    const settingsSnapshot = jsonRecord(job.settingsSnapshot);
    const templateData = jsonRecord(job.templateSnapshot);
    const approver = jsonRecord(job.signerSnapshot);
    const rawFindings = evaluation.findings;
    if (!Array.isArray(rawFindings) || rawFindings.length === 0) {
      throw new BadRequestException('Snapshot temuan evaluasi belum tersedia');
    }
    const findings = rawFindings.map((value) => {
      const finding = jsonRecord(value);
      return {
        requirement: snapshotString(finding, 'requirement'),
        note: snapshotString(finding, 'note'),
      };
    });
    const signerName = snapshotString(approver, 'name');
    const signerPosition = snapshotString(approver, 'position');
    const signatoryNip =
      typeof approver.nip === 'string' ? approver.nip : undefined;
    const template: RejectionLetterTemplateSnapshot = {
      rekomtekType:
        typeof templateData.rekomtekType === 'string'
          ? templateData.rekomtekType
          : job.rekomtek.jenis,
      jenisPermohonan:
        typeof templateData.jenisPermohonan === 'string'
          ? templateData.jenisPermohonan
          : job.rekomtek.jenisPermohonan,
      version:
        typeof templateData.version === 'number'
          ? templateData.version
          : undefined,
      subjectTemplate: snapshotString(templateData, 'subjectTemplate'),
      bodyTemplate: snapshotString(templateData, 'bodyTemplate'),
      closingTemplate: snapshotString(templateData, 'closingTemplate'),
    };
    validateRejectionLetterTemplate(template);

    const token = createRejectionLetterVerificationToken();
    const testOrigin = getLocalQrTestOrigin(process.env.APP_URL);
    const verificationUrl = buildRejectionLetterVerificationUrl(
      testOrigin,
      token.token,
      { allowInsecureLoopbackForTest: true },
    );
    const verificationQrPng = await createRejectionLetterQrPng(
      verificationUrl,
      { allowInsecureLoopbackForTest: true },
    );
    const outgoingNumber = snapshotString(
      { outgoingNumber: job.outgoingNumber },
      'outgoingNumber',
    );
    const city = snapshotString(settingsSnapshot, 'issueCity');
    const institutionName = snapshotString(settingsSnapshot, 'institutionName');
    const letter = buildConfiguredRejectionLetterDraft({
      applicationNumber: snapshotString(
        applicant,
        'applicationNumber',
        job.rekomtek.nomor,
      ),
      applicationTitle: snapshotString(
        applicant,
        'applicationTitle',
        job.rekomtek.judul,
      ),
      applicationType: snapshotString(
        applicant,
        'applicationType',
        `${job.rekomtek.jenis} / ${job.rekomtek.jenisPermohonan}`,
      ),
      applicantName: snapshotString(applicant, 'applicantName'),
      applicantOrganization:
        typeof applicant.applicantOrganization === 'string'
          ? applicant.applicantOrganization
          : undefined,
      applicantAddress:
        typeof applicant.applicantAddress === 'string'
          ? applicant.applicantAddress
          : undefined,
      evaluationSummary: snapshotString(evaluation, 'summary'),
      findings,
      outgoingNumber,
      outgoingDate: job.outgoingDate,
      settings: {
        institutionName,
        institutionAddress:
          typeof settingsSnapshot.institutionAddress === 'string'
            ? settingsSnapshot.institutionAddress
            : undefined,
        issueCity: city,
        signatoryName: signerName,
        signatoryPosition: signerPosition,
        signatoryNip,
      },
      template,
    });
    letter.disclaimer = 'PRATINJAU LOKAL';
    letter.closing = letter.closing
      .replaceAll(signerName, '')
      .replace(/[\s,]+$/g, '')
      .trim();
    letter.signatureLines = [
      `${city}, ${letter.letterDate ?? ''}`.trim(),
      'Persetujuan Kepala Bidang tercatat melalui SIPENGSUI',
      signerName,
      [signerPosition, signatoryNip].filter(Boolean).join(' · '),
    ];
    letter.verificationQrPng = verificationQrPng;
    letter.logoBuffer =
      decodeRejectionLetterLogo(
        typeof settingsSnapshot.logoDataUrl === 'string'
          ? settingsSnapshot.logoDataUrl
          : null,
      ) ?? undefined;

    const pdf = await renderRejectionLetterPdf(letter);
    const finalPdfStorageKey = await fileStorage.storeGeneratedPdf(pdf);
    try {
      const storedPdf = await fileStorage.readBuffer(finalPdfStorageKey);
      if (
        storedPdf.subarray(0, 5).toString('ascii') !== '%PDF-' ||
        !storedPdf.equals(pdf)
      ) {
        throw new ConflictException(
          'PDF uji QR yang tersimpan tidak cocok dengan hasil pembuatan',
        );
      }
      const finalPdfChecksum = createHash('sha256')
        .update(storedPdf)
        .digest('hex');
      const issuedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const update = await tx.rejectionLetterJob.updateMany({
          where: {
            id: jobId,
            status: RejectionLetterJobStatus.BLOCKED_TTE,
            updatedAt: job.updatedAt,
            issuedAt: null,
            outgoingNumber,
          },
          data: {
            status: RejectionLetterJobStatus.ISSUED,
            issuanceMethod: RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR,
            isTestOnly: true,
            approvalSnapshot: {
              userId: job.approvedById,
              approvedAt: job.approvedAt?.toISOString(),
              name: signerName,
              position: signerPosition,
              method: 'HEAD_APPROVAL_QR',
              testOnly: true,
            },
            finalPdfStorageKey,
            finalPdfChecksum,
            verificationTokenHash: token.tokenHash,
            issuedAt,
            signatureVerified: false,
            failureReason: null,
          },
        });
        if (update.count !== 1) {
          throw new ConflictException(
            'Job uji berubah bersamaan; muat ulang sebelum menerbitkan QR uji',
          );
        }
        await workflowService.transitionRejectionToIssuedInTransaction(
          tx,
          job.rekomtekId,
          user,
          {
            issuanceMethod: RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR,
            jobId,
            isTestOnly: true,
            finalPdfChecksum,
          },
          { suppressNotifications: true },
        );
        const latestArtifact = await tx.rekomtekArtifact.aggregate({
          where: {
            rekomtekId: job.rekomtekId,
            type: RekomtekArtifactType.SURAT_PENOLAKAN,
          },
          _max: { version: true },
        });
        await tx.rekomtekArtifact.create({
          data: {
            rekomtekId: job.rekomtekId,
            type: RekomtekArtifactType.SURAT_PENOLAKAN,
            version: (latestArtifact._max.version ?? 0) + 1,
            fileName: `UJI-LOKAL-${rejectionLetterFileName(snapshotString(applicant, 'applicationNumber'))}`,
            storageKey: finalPdfStorageKey,
            mimeType: 'application/pdf',
            fileSize: storedPdf.length,
            checksum: finalPdfChecksum,
            technicalStatus: BerkasTechnicalStatus.VALID,
            stage: RekomtekWorkflowStage.DITOLAK,
            status: RekomtekArtifactStatus.FINAL,
            createdById: user.userId,
            finalizedById: user.userId,
            finalizedAt: issuedAt,
            metadata: {
              issuanceMethod: 'HEAD_APPROVAL_QR',
              isTestOnly: true,
              notificationsSuppressed: true,
              sourceJobId: jobId,
            },
          },
        });
        await tx.rejectionLetterJobEvent.create({
          data: {
            jobId,
            action: 'LOCAL_TEST_QR_PUBLISHED_NO_NOTIFICATION',
            fromStatus: RejectionLetterJobStatus.BLOCKED_TTE,
            toStatus: RejectionLetterJobStatus.ISSUED,
            actorId: user.userId,
            actorRole: user.role,
            metadata: {
              issuanceMethod: 'HEAD_APPROVAL_QR',
              isTestOnly: true,
              outgoingNumberReused: true,
              notificationsSuppressed: true,
              finalPdfChecksum,
            },
          },
        });
      });
      return {
        id: jobId,
        status: RejectionLetterJobStatus.ISSUED,
        issuanceMethod: RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR,
        isTestOnly: true,
        outgoingNumber,
        issuedAt,
        finalPdfChecksum,
        finalPdfAvailable: true,
        notificationSent: false,
        signingEnabled: false,
      };
    } catch (error) {
      await fileStorage.remove(finalPdfStorageKey);
      throw error;
    }
  }

  async getPublicVerification(token: string) {
    let verificationTokenHash: string;
    try {
      verificationTokenHash = hashRejectionLetterVerificationToken(token);
    } catch {
      throw new NotFoundException('Informasi verifikasi surat tidak ditemukan');
    }
    const job = await this.prisma.rejectionLetterJob.findUnique({
      where: { verificationTokenHash },
      select: {
        status: true,
        issuanceMethod: true,
        isTestOnly: true,
        outgoingNumber: true,
        outgoingDate: true,
        issuedAt: true,
        preparedPdfChecksum: true,
        finalPdfChecksum: true,
        signatureVerified: true,
        settingsSnapshot: true,
        signerSnapshot: true,
        approvalSnapshot: true,
      },
    });
    if (!job)
      throw new NotFoundException('Informasi verifikasi surat tidak ditemukan');
    const settings = jsonRecord(job.settingsSnapshot);
    const signer = jsonRecord(job.signerSnapshot);
    const approver = jsonRecord(job.approvalSnapshot);
    const qrIssued =
      job.status === RejectionLetterJobStatus.ISSUED &&
      Boolean(job.finalPdfChecksum) &&
      job.issuanceMethod === RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR;
    const testOnly = qrIssued && job.isTestOnly;
    const legacyTteIssued =
      job.status === RejectionLetterJobStatus.ISSUED &&
      Boolean(job.finalPdfChecksum) &&
      job.signatureVerified &&
      job.issuanceMethod !== RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR;
    const officiallyIssued = !testOnly && (qrIssued || legacyTteIssued);
    const message = testOnly
      ? 'Uji QR lokal. Dokumen ini bukan surat resmi dan QR bukan tanda tangan atau TTE.'
      : qrIssued
        ? 'QR valid dan cocok dengan data surat resmi yang tersimpan di server. Surat diterbitkan berdasarkan persetujuan Kepala Bidang; QR bukan tanda tangan atau TTE.'
        : legacyTteIssued
          ? 'Dokumen resmi dan tanda tangan elektronik terverifikasi.'
          : 'Dokumen belum diterbitkan dan belum memiliki tanda tangan elektronik terverifikasi.';
    return {
      status: testOnly
        ? 'TEST_ONLY'
        : officiallyIssued
          ? 'VALID'
          : 'NOT_ISSUED',
      officiallyIssued,
      isTestOnly: Boolean(testOnly),
      issuanceMethod: job.issuanceMethod,
      letterNumber: job.outgoingNumber,
      issuedAt: officiallyIssued || testOnly ? job.issuedAt : null,
      institutionName:
        typeof settings.institutionName === 'string'
          ? settings.institutionName
          : null,
      ...(qrIssued && !testOnly
        ? {
            subject:
              typeof approver.publicSubject === 'string'
                ? approver.publicSubject
                : null,
            documentType: 'SURAT PENOLAKAN',
            approverName:
              typeof approver.name === 'string' ? approver.name : null,
            approverPosition:
              typeof approver.position === 'string' ? approver.position : null,
          }
        : {}),
      ...(legacyTteIssued
        ? {
            signerName: typeof signer.name === 'string' ? signer.name : null,
            signerPosition:
              typeof signer.position === 'string' ? signer.position : null,
          }
        : {}),
      message,
    };
  }

  async verifyPublicFile(token: string, buffer: Buffer) {
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new BadRequestException(
        'File verifikasi harus berupa PDF yang valid',
      );
    }
    let verificationTokenHash: string;
    try {
      verificationTokenHash = hashRejectionLetterVerificationToken(token);
    } catch {
      throw new NotFoundException('Informasi verifikasi surat tidak ditemukan');
    }
    const job = await this.prisma.rejectionLetterJob.findUnique({
      where: { verificationTokenHash },
      select: {
        status: true,
        issuanceMethod: true,
        isTestOnly: true,
        outgoingNumber: true,
        preparedPdfChecksum: true,
        finalPdfChecksum: true,
        signatureVerified: true,
      },
    });
    if (!job)
      throw new NotFoundException('Informasi verifikasi surat tidak ditemukan');
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const result = verifyRejectionLetterFile(
      {
        status: job.status,
        preparedPdfChecksum: job.preparedPdfChecksum,
        finalPdfChecksum: job.finalPdfChecksum,
        signatureVerified: job.signatureVerified,
        issuanceMethod: job.issuanceMethod,
        isTestOnly: job.isTestOnly,
      },
      checksum,
    );
    let message: string;
    switch (result.status) {
      case 'TEST_ONLY':
        message = 'File cocok dengan uji QR lokal, tetapi bukan surat resmi.';
        break;
      case 'PREVIEW_ONLY':
        message =
          'File cocok dengan pratinjau internal, tetapi belum ditandatangani atau diterbitkan.';
        break;
      case 'VALID':
        message =
          job.issuanceMethod === RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR
            ? 'File cocok dengan surat terbit berdasarkan persetujuan Kepala Bidang; QR bukan TTE.'
            : 'File resmi dan tanda tangan elektronik terverifikasi.';
        break;
      case 'SIGNATURE_UNVERIFIED':
        message =
          'File ditemukan, tetapi tanda tangan elektronik tidak dapat diverifikasi.';
        break;
      default:
        message = 'File tidak cocok dengan dokumen resmi yang tercatat.';
    }
    return {
      status: result.status,
      officiallyIssued: result.valid,
      isTestOnly: result.status === 'TEST_ONLY',
      issuanceMethod: job.issuanceMethod,
      letterNumber: job.outgoingNumber,
      message,
    };
  }

  async getPreparedPreview(jobId: string, user: AuthenticatedUser) {
    if (!this.fileStorage) {
      throw new ConflictException('Penyimpanan pratinjau belum tersedia');
    }
    const settings = await this.prisma.rejectionLetterSettings.findUnique({
      where: { id: 'default' },
      select: { activeHeadUserId: true },
    });
    await this.assertCurrentHead(user, settings?.activeHeadUserId);
    const job = await this.prisma.rejectionLetterJob.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        isTestOnly: true,
        issuanceMethod: true,
        outgoingNumber: true,
        preparedPdfStorageKey: true,
        preparedPdfChecksum: true,
        finalPdfStorageKey: true,
        finalPdfChecksum: true,
      },
    });
    if (!job) throw new NotFoundException('Pratinjau surat tidak ditemukan');
    const issuedQr =
      job.status === RejectionLetterJobStatus.ISSUED &&
      job.issuanceMethod === RejectionLetterIssuanceMethod.HEAD_APPROVAL_QR;
    const storageKey = issuedQr
      ? job.finalPdfStorageKey
      : job.preparedPdfStorageKey;
    const expectedChecksum = issuedQr
      ? job.finalPdfChecksum
      : job.preparedPdfChecksum;
    if (
      (!issuedQr && job.status !== RejectionLetterJobStatus.BLOCKED_TTE) ||
      !storageKey ||
      !expectedChecksum
    ) {
      throw new ConflictException('Pratinjau surat belum tersedia');
    }
    const buffer = await this.fileStorage.readBuffer(storageKey);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    if (
      checksum !== expectedChecksum ||
      buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new ConflictException('Checksum pratinjau tidak cocok');
    }
    return {
      buffer,
      fileName: issuedQr
        ? job.isTestOnly
          ? 'UJI-LOKAL-Surat-Penolakan.pdf'
          : 'Surat-Penolakan.pdf'
        : 'Pratinjau-Surat-Penolakan.pdf',
      status: job.status,
      isTestOnly: issuedQr && job.isTestOnly,
    };
  }

  async getApplicantPreparedPreview(
    rekomtekId: string,
    user: AuthenticatedUser,
  ) {
    if (!this.fileStorage) {
      throw new ConflictException('Penyimpanan pratinjau belum tersedia');
    }
    const job = await this.prisma.rejectionLetterJob.findFirst({
      where: {
        rekomtekId,
        status: {
          in: [
            RejectionLetterJobStatus.WAITING_APPROVAL,
            RejectionLetterJobStatus.BLOCKED_TTE,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        preparedPdfStorageKey: true,
        preparedPdfChecksum: true,
        applicantSnapshot: true,
        evaluationSnapshot: true,
        rekomtek: { select: { createdById: true } },
      },
    });
    if (!job) {
      throw new NotFoundException('Draf surat penolakan tidak ditemukan');
    }
    if (job.rekomtek.createdById !== user.userId) {
      throw new ForbiddenException(
        'Draf surat penolakan hanya tersedia bagi pemohonnya',
      );
    }
    if (job.status === RejectionLetterJobStatus.BLOCKED_TTE) {
      if (!job.preparedPdfStorageKey || !job.preparedPdfChecksum) {
        throw new ConflictException(
          'Pratinjau internal belum berhasil disiapkan',
        );
      }
      const buffer = await this.fileStorage.readBuffer(
        job.preparedPdfStorageKey,
      );
      const checksum = createHash('sha256').update(buffer).digest('hex');
      if (
        checksum !== job.preparedPdfChecksum ||
        buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
      ) {
        throw new ConflictException(
          'Checksum draf surat penolakan tidak cocok',
        );
      }
      return {
        buffer,
        fileName: 'Draf-Surat-Penolakan.pdf',
        status: job.status,
      };
    }

    const applicant = jsonRecord(job.applicantSnapshot);
    const evaluation = jsonRecord(job.evaluationSnapshot);
    const findings = Array.isArray(evaluation.findings)
      ? evaluation.findings.map((value) => {
          const finding = jsonRecord(value);
          return {
            requirement: snapshotString(finding, 'requirement'),
            note: snapshotString(finding, 'note'),
          };
        })
      : [];
    const draft = buildRejectionLetterDraft({
      applicationNumber: snapshotString(applicant, 'applicationNumber'),
      applicationTitle: snapshotString(applicant, 'applicationTitle'),
      applicationType: snapshotString(applicant, 'applicationType'),
      applicantName: snapshotString(applicant, 'applicantName'),
      applicantOrganization:
        typeof applicant.applicantOrganization === 'string'
          ? applicant.applicantOrganization
          : undefined,
      applicantAddress:
        typeof applicant.applicantAddress === 'string'
          ? applicant.applicantAddress
          : undefined,
      evaluationSummary:
        typeof evaluation.summary === 'string' ? evaluation.summary : undefined,
      findings,
    });
    return {
      buffer: await renderRejectionLetterPdf(draft),
      fileName: 'Draf-Surat-Penolakan.pdf',
      status: job.status,
    };
  }

  async listApprovalQueue(user: AuthenticatedUser) {
    const settings = await this.prisma.rejectionLetterSettings.findUnique({
      where: { id: 'default' },
      select: { activeHeadUserId: true },
    });
    await this.assertCurrentHead(user, settings?.activeHeadUserId);
    return this.prisma.rejectionLetterJob.findMany({
      where: {
        OR: [
          {
            status: {
              in: [
                RejectionLetterJobStatus.WAITING_APPROVAL,
                RejectionLetterJobStatus.APPROVED_PREPARING,
                RejectionLetterJobStatus.FAILED,
                RejectionLetterJobStatus.BLOCKED_TTE,
              ],
            },
          },
          {
            status: RejectionLetterJobStatus.ISSUED,
            isTestOnly: true,
          },
        ],
      },
      select: {
        id: true,
        status: true,
        issuanceMethod: true,
        isTestOnly: true,
        rekomtekId: true,
        outgoingNumber: true,
        outgoingDate: true,
        approvedAt: true,
        finalPdfChecksum: true,
        preparedPdfChecksum: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        rekomtek: {
          select: {
            nomor: true,
            judul: true,
            jenis: true,
            jenisPermohonan: true,
          },
        },
        evaluationRound: {
          select: {
            summary: true,
            findings: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }
}
