import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

export function assertRejectionLetterApprover(
  user: AuthenticatedUser,
  activeHeadUserId: string | null | undefined,
): void {
  const isHead =
    user.roles?.includes('KEPALA_BIDANG') || user.role === 'KEPALA_BIDANG';
  const hasApprovalPermission =
    user.permissions.includes('rekomtek.approve.final') ||
    user.permissions.includes('*');
  if (
    !isHead ||
    !hasApprovalPermission ||
    !activeHeadUserId ||
    user.userId !== activeHeadUserId
  ) {
    throw new ForbiddenException(
      'Persetujuan hanya dapat dilakukan oleh Kepala Bidang aktif yang berwenang',
    );
  }
}

export function missingRejectionLetterSettingFields(
  settings: Record<string, unknown> | null | undefined,
): string[] {
  const required = [
    'institutionName',
    'institutionAddress',
    'issueCity',
    'verificationDomain',
    'outgoingNumberFormat',
    'classificationCode',
    'agendaSource',
    'agendaScope',
    'initialLastNumber',
    'numberResetRule',
    'activeHeadUserId',
    'activeHeadName',
    'activeHeadPosition',
    'authorityStartsAt',
    'authorityEndsAt',
  ];
  if (!settings) return required;
  return required.filter((field) => {
    const value = settings[field];
    return value === null || value === undefined || value === '';
  });
}

export interface RejectionLetterQrReadinessInput {
  settingsComplete: boolean;
  logoAndNipPresent: boolean;
  authorityCurrent: boolean;
  activeHeadEligible: boolean;
  verificationOriginMatches: boolean;
  activeTemplateAvailable: boolean;
  arialFontsAvailable: boolean;
}

export function assessRejectionLetterQrReadiness(
  input: RejectionLetterQrReadinessInput,
) {
  const checks = [
    {
      code: 'SETTINGS_COMPLETE',
      label: 'Pengaturan wajib lengkap',
      ready: input.settingsComplete,
    },
    {
      code: 'LOGO_AND_NIP',
      label: 'Logo resmi dan NIP Kepala Bidang tersedia',
      ready: input.logoAndNipPresent,
    },
    {
      code: 'AUTHORITY_CURRENT',
      label: 'Masa kewenangan Kepala Bidang sedang berlaku',
      ready: input.authorityCurrent,
    },
    {
      code: 'ACTIVE_HEAD_ELIGIBLE',
      label: 'Kepala Bidang aktif memiliki role dan permission persetujuan',
      ready: input.activeHeadEligible,
    },
    {
      code: 'VERIFICATION_ORIGIN',
      label: 'APP_URL cocok dengan domain verifikasi HTTPS',
      ready: input.verificationOriginMatches,
    },
    {
      code: 'ACTIVE_TEMPLATE',
      label: 'Tersedia template surat aktif',
      ready: input.activeTemplateAvailable,
    },
    {
      code: 'ARIAL_FONTS',
      label: 'Font Arial Regular dan Bold tersedia di runtime API',
      ready: input.arialFontsAvailable,
    },
  ];
  return {
    method: 'HEAD_APPROVAL_QR' as const,
    ready: checks.every((check) => check.ready),
    checks,
    blockers: checks
      .filter((check) => !check.ready)
      .map((check) => check.label),
  };
}

export function assertRejectionLetterAuthorityIsCurrent(
  settings: Record<string, unknown>,
  at: Date,
): void {
  const startsAt = new Date(String(settings.authorityStartsAt));
  const endsAt = new Date(String(settings.authorityEndsAt));
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    startsAt > at ||
    endsAt < at
  ) {
    throw new ForbiddenException(
      'Masa kewenangan Kepala Bidang aktif belum berlaku atau sudah berakhir',
    );
  }
}

export function assertRejectionLetterSettingsManager(
  user: AuthenticatedUser,
): void {
  const isAdmin =
    user.roles?.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role)) ||
    ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
  const hasPermission =
    user.permissions.includes('rekomtek.rejection-letter.manage') ||
    user.permissions.includes('*');
  if (!isAdmin || !hasPermission) {
    throw new ForbiddenException('Tidak berwenang mengelola pengaturan surat');
  }
}

export function normalizeOfficialVerificationDomain(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ForbiddenException(
      'Domain verifikasi harus HTTPS resmi tanpa path',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new ForbiddenException(
      'Domain verifikasi harus HTTPS resmi tanpa path',
    );
  }
  return url.origin;
}
