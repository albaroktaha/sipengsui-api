import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveRejectionLetterSettingsDto } from './rejection-letter.dto';

const validSettings = {
  institutionName: 'Dinas Sumber Daya Air',
  institutionAddress: 'Alamat instansi',
  issueCity: 'Bandung',
  verificationDomain: 'https://example.go.id',
  outgoingNumberFormat: '{{sequence}}/{{classification}}/{{year}}',
  classificationCode: '600.1',
  agendaSource: 'Sekretariat',
  agendaScope: 'REKOMTEK',
  initialLastNumber: 0,
  numberResetRule: 'TAHUNAN',
  activeHeadUserId: '550e8400-e29b-41d4-a716-446655440000',
  activeHeadName: 'Nama Kepala Bidang',
  activeHeadPosition: 'Kepala Bidang',
  authorityStartsAt: '2026-01-01T00:00:00.000Z',
  authorityEndsAt: '2026-12-31T23:59:59.000Z',
  templates: [
    {
      rekomtekType: 'APU',
      jenisPermohonan: 'IZIN_BARU',
      subjectTemplate: 'Penolakan permohonan {{applicationNumber}}',
      bodyTemplate:
        '{{companyName}} {{applicationNumber}} {{applicationTitle}} {{applicationType}} {{evaluationSummary}} {{rejectionReasons}}',
      closingTemplate: 'Hormat kami, {{signatoryName}}',
    },
  ],
};

describe('SaveRejectionLetterSettingsDto', () => {
  it('accepts an official configuration without TTE activation flags', async () => {
    const dto = plainToInstance(SaveRejectionLetterSettingsDto, validSettings);
    await expect(
      validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
  });

  it('rejects attempts to enable signing or publishing through settings', async () => {
    const dto = plainToInstance(SaveRejectionLetterSettingsDto, {
      ...validSettings,
      signingEnabled: true,
      publishingEnabled: true,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.some((error) => error.property === 'signingEnabled')).toBe(
      true,
    );
    expect(errors.some((error) => error.property === 'publishingEnabled')).toBe(
      true,
    );
  });
});
