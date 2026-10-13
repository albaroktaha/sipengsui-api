import {
  assertRejectionLetterApprover,
  assertRejectionLetterSettingsManager,
  assertRejectionLetterAuthorityIsCurrent,
  assessRejectionLetterQrReadiness,
  missingRejectionLetterSettingFields,
  normalizeOfficialVerificationDomain,
} from './rejection-letter-approval-policy';

describe('rejection-letter approval settings policy', () => {
  it('requires the dedicated KEPALA_BIDANG role and final-approval permission', () => {
    expect(() =>
      assertRejectionLetterApprover(
        {
          userId: 'head-1',
          email: 'head@example.test',
          role: 'KEPALA_BIDANG',
          roles: ['KEPALA_BIDANG'],
          permissions: ['rekomtek.approve.final'],
        },
        'head-1',
      ),
    ).not.toThrow();

    expect(() =>
      assertRejectionLetterApprover(
        {
          userId: 'pejabat-1',
          email: 'pejabat@example.test',
          role: 'PIMPINAN',
          roles: ['PIMPINAN'],
          permissions: ['rekomtek.approve.final'],
        },
        'pejabat-1',
      ),
    ).toThrow('Persetujuan hanya dapat dilakukan oleh Kepala Bidang aktif');
  });

  it('reports QR issuance readiness and every blocking prerequisite', () => {
    const ready = assessRejectionLetterQrReadiness({
      settingsComplete: true,
      logoAndNipPresent: true,
      authorityCurrent: true,
      activeHeadEligible: true,
      verificationOriginMatches: true,
      activeTemplateAvailable: true,
      arialFontsAvailable: true,
    });
    expect(ready.ready).toBe(true);
    expect(ready.blockers).toEqual([]);

    const blocked = assessRejectionLetterQrReadiness({
      settingsComplete: false,
      logoAndNipPresent: false,
      authorityCurrent: false,
      activeHeadEligible: false,
      verificationOriginMatches: false,
      activeTemplateAvailable: false,
      arialFontsAvailable: false,
    });
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toEqual([
      'Pengaturan wajib lengkap',
      'Logo resmi dan NIP Kepala Bidang tersedia',
      'Masa kewenangan Kepala Bidang sedang berlaku',
      'Kepala Bidang aktif memiliki role dan permission persetujuan',
      'APP_URL cocok dengan domain verifikasi HTTPS',
      'Tersedia template surat aktif',
      'Font Arial Regular dan Bold tersedia di runtime API',
    ]);
  });

  it('reports missing official fields in a stable order', () => {
    expect(missingRejectionLetterSettingFields(null)).toEqual([
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
    ]);
  });

  it('rejects approval outside the configured authority period', () => {
    expect(() =>
      assertRejectionLetterAuthorityIsCurrent(
        {
          authorityStartsAt: new Date('2026-01-01T00:00:00Z'),
          authorityEndsAt: new Date('2026-06-30T23:59:59Z'),
        },
        new Date('2026-07-01T00:00:00Z'),
      ),
    ).toThrow(
      'Masa kewenangan Kepala Bidang aktif belum berlaku atau sudah berakhir',
    );
  });

  it('requires an authorized administrator to manage official settings', () => {
    expect(() =>
      assertRejectionLetterSettingsManager({
        userId: 'admin-1',
        role: 'ADMIN',
        roles: ['ADMIN'],
        permissions: [],
        email: 'admin@example.test',
      }),
    ).toThrow('Tidak berwenang mengelola pengaturan surat');
  });

  it('accepts only an HTTPS origin for the public verification domain', () => {
    expect(
      normalizeOfficialVerificationDomain('https://surat.example.go.id'),
    ).toBe('https://surat.example.go.id');
    expect(() =>
      normalizeOfficialVerificationDomain('http://surat.example.go.id'),
    ).toThrow('Domain verifikasi harus HTTPS resmi tanpa path');
    expect(() =>
      normalizeOfficialVerificationDomain('https://example.test/path'),
    ).toThrow('Domain verifikasi harus HTTPS resmi tanpa path');
  });
});
