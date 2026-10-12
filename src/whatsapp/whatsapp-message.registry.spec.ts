import { WhatsAppConfig } from './whatsapp.config';
import { WhatsAppMessageRegistry } from './whatsapp-message.registry';

const appUrl =
  'https://sipengsui.example/dashboard/rekomtek/rekomtek-1?schedule=schedule-1';

function createRegistry(): WhatsAppMessageRegistry {
  return new WhatsAppMessageRegistry({
    defaultLanguage: 'id',
    messageVersion: jest.fn().mockReturnValue('v3'),
  } as never);
}

function createScheduleContext(overrides: Record<string, unknown> = {}) {
  return {
    invitationNumber: '005/UND-EKS/VIII/2026',
    companyName: 'PT. Bukit Asam Tbk',
    startsAt: new Date('2026-09-25T04:30:00.000Z'),
    endsAt: new Date('2026-09-25T05:15:00.000Z'),
    timeZone: 'Asia/Jakarta',
    method: 'DARING',
    venue: null,
    agenda: 'Rapat Galian C',
    applicationUrl: appUrl,
    ...overrides,
  };
}

describe('WhatsAppMessageRegistry expose messages', () => {
  it('renders the invitation as a scannable multiline message', () => {
    const message = createRegistry().resolve(
      'EXPOSE_INVITATION',
      createScheduleContext(),
    );

    expect(message).toEqual({
      messageKey: 'EXPOSE_INVITATION',
      messageVersion: 'v3',
      language: 'id',
      text: [
        '*Undangan Ekspose*',
        'Pemohon: PT. Bukit Asam Tbk',
        'Nomor undangan: 005/UND-EKS/VIII/2026',
        'Tanggal: Jumat, 25 September 2026',
        'Waktu: 11.30-12.15 WIB',
        'Metode: Daring',
        'Agenda: Rapat Galian C',
        '',
        'Lihat undangan di SIPENGSUI:',
        appUrl,
      ].join('\n'),
    });
    expect(message?.text).not.toContain('REK-20260901-237');
  });

  it('renders an update with the new schedule and a separate link', () => {
    const message = createRegistry().resolve(
      'EXPOSE_RESCHEDULED',
      createScheduleContext({
        startsAt: new Date('2026-10-06T06:35:00.000Z'),
        endsAt: new Date('2026-10-06T10:34:00.000Z'),
        method: 'LURING',
        venue: 'SDA',
        agenda: 'Pembahasan permohonan',
      }),
    );

    expect(message?.text).toBe(
      [
        '*Jadwal Ekspose Diperbarui*',
        'Pemohon: PT. Bukit Asam Tbk',
        'Nomor undangan: 005/UND-EKS/VIII/2026',
        'Tanggal: Selasa, 6 Oktober 2026',
        'Waktu: 13.35-17.34 WIB',
        'Metode: Luring',
        'Tempat: SDA',
        'Agenda: Pembahasan permohonan',
        '',
        'Lihat detail undangan di SIPENGSUI:',
        appUrl,
      ].join('\n'),
    );
  });

  it('omits a venue that does not apply to an online schedule', () => {
    const message = createRegistry().resolve(
      'EXPOSE_RESCHEDULED',
      createScheduleContext({ venue: 'Ruang rapat' }),
    );

    expect(message?.text).not.toContain('Tempat:');
    expect(message?.text).toContain('Metode: Daring');
  });

  it('keeps cancellation notices brief and includes the safe reason', () => {
    const message = createRegistry().resolve(
      'EXPOSE_CANCELLED',
      createScheduleContext({
        method: 'LURING',
        cancellationReason: 'Pejabat berhalangan hadir.',
      }),
    );

    expect(message?.text).toBe(
      [
        '*Jadwal Ekspose Dibatalkan*',
        'Pemohon: PT. Bukit Asam Tbk',
        'Nomor undangan: 005/UND-EKS/VIII/2026',
        'Waktu: Jumat, 25 September 2026, 11.30-12.15 WIB',
        'Alasan: Pejabat berhalangan hadir.',
        '',
        'Lihat detail undangan di SIPENGSUI:',
        appUrl,
      ].join('\n'),
    );
  });

  it('uses the same compact schedule hierarchy for reminders', () => {
    const message = createRegistry().resolve(
      'EXPOSE_REMINDER',
      createScheduleContext({ method: 'HIBRID', venue: 'Ruang rapat' }),
    );

    expect(message?.text).toBe(
      [
        '*Pengingat Ekspose*',
        'Pemohon: PT. Bukit Asam Tbk',
        'Tanggal: Jumat, 25 September 2026',
        'Waktu: 11.30-12.15 WIB',
        'Metode: Hibrida',
        'Tempat: Ruang rapat',
        '',
        'Lihat detail undangan di SIPENGSUI:',
        appUrl,
      ].join('\n'),
    );
  });
});

describe('WhatsAppConfig expose message versions', () => {
  it('defaults redesigned schedule messages to version v3', () => {
    const config = new WhatsAppConfig({ get: () => undefined } as never);

    expect([
      config.messageVersion('EXPOSE_INVITATION'),
      config.messageVersion('EXPOSE_RESCHEDULED'),
      config.messageVersion('EXPOSE_CANCELLED'),
      config.messageVersion('EXPOSE_REMINDER'),
    ]).toEqual(['v3', 'v3', 'v3', 'v3']);
  });
});
