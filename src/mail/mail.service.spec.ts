/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { MailService, buildRejectionLetterEmail } from './mail.service';

describe('rejection letter email', () => {
  const data = {
    email: 'pemohon@example.com',
    applicantName: '<Nama Pemohon>',
    applicationNumber: 'RKT/001/2026',
    applicationTitle: 'Pemanfaatan Air Permukaan',
    applicationUrl: 'https://sipengsui.example/dashboard/rekomtek/rekomtek-1',
  };

  it('builds an escaped email with the application detail link', () => {
    const message = buildRejectionLetterEmail(data);

    expect(message.to).toBe(data.email);
    expect(message.subject).toContain(data.applicationNumber);
    expect(message.html).toContain('&lt;Nama Pemohon&gt;');
    expect(message.html).toContain(data.applicationUrl);
    expect(message.html).toContain('Surat Penolakan');
    expect(message.html).not.toContain('<Nama Pemohon>');
  });

  it('delegates rejection email delivery to the shared mail sender', async () => {
    const service = new MailService();
    const sendMail = jest
      .spyOn(service, 'sendMail')
      .mockResolvedValue(undefined);

    await service.sendRejectionLetterEmail(data);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: data.email,
        subject: expect.stringContaining(data.applicationNumber),
        html: expect.stringContaining(data.applicationUrl),
      }),
    );
  });
});
