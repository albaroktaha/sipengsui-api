import { validateRejectionLetterTemplate } from './rejection-letter-template';

describe('validateRejectionLetterTemplate', () => {
  const template = {
    subjectTemplate: 'Penolakan {{applicationNumber}}',
    bodyTemplate:
      '{{companyName}} {{applicationNumber}} {{applicationTitle}} {{applicationType}} {{evaluationSummary}} {{rejectionReasons}}',
    closingTemplate: 'Hormat kami, {{signatoryName}}',
  };

  it('accepts a complete template using only supported placeholders', () => {
    expect(() => validateRejectionLetterTemplate(template)).not.toThrow();
  });

  it('rejects an unsupported placeholder before saving a template', () => {
    expect(() =>
      validateRejectionLetterTemplate({
        ...template,
        bodyTemplate: `${template.bodyTemplate} {{unknownField}}`,
      }),
    ).toThrow('Template surat memuat variabel yang tidak didukung');
  });

  it('requires the application number and signatory identity in stable locations', () => {
    expect(() =>
      validateRejectionLetterTemplate({
        ...template,
        subjectTemplate: 'Penolakan',
      }),
    ).toThrow('Template perihal wajib memuat {{applicationNumber}}');
  });
});
