import { WhatsAppMessageRegistry } from './whatsapp-message.registry';

describe('WhatsAppMessageRegistry expose invitation', () => {
  it('renders the invitation with the company name in a readable multiline format', () => {
    const registry = new WhatsAppMessageRegistry({
      defaultLanguage: 'id',
      messageVersion: jest.fn().mockReturnValue('v2'),
    } as never);

    const message = registry.resolve('EXPOSE_INVITATION', {
      invitationNumber: '005/UND-EKS/VIII/2026',
      companyName: 'PT. Bukit Asam Tbk',
      startsAt: new Date('2026-09-25T04:30:00.000Z'),
      endsAt: new Date('2026-09-25T05:15:00.000Z'),
      timeZone: 'Asia/Jakarta',
      method: 'DARING',
      venue: null,
      agenda: 'Rapat Galian C',
      applicationUrl:
        'https://sipengsui.example/dashboard/rekomtek/rekomtek-1?schedule=schedule-1',
    });

    expect(message).toEqual({
      messageKey: 'EXPOSE_INVITATION',
      messageVersion: 'v2',
      language: 'id',
      text: [
        'Undangan Ekspose 005/UND-EKS/VIII/2026 untuk Permohonan Rekomtek PT. Bukit Asam Tbk,',
        'Waktu: 25/09/2026, 11.30–12.15 WIB',
        'Metode: DARING',
        'Tempat: —',
        'Agenda: Rapat Galian C',
        'Buka detail undangan di SIPENGSUI: https://sipengsui.example/dashboard/rekomtek/rekomtek-1?schedule=schedule-1',
      ].join('\n'),
    });
    expect(message?.text).not.toContain('REK-20260901-237');
  });
});
