import {
  getRejectionLetterPeriodKey,
  renderRejectionLetterNumber,
} from './rejection-letter-number';

describe('rejection letter outgoing-number rules', () => {
  it('uses only the configured number format and values', () => {
    expect(
      renderRejectionLetterNumber({
        format: '{{classification}}/{{sequence}}/{{year}}/{{scope}}',
        classificationCode: 'KLAS-RESMI',
        agendaScope: 'AGENDA-RESMI',
        sequence: 42,
        date: new Date('2026-07-09T03:00:00.000Z'),
      }),
    ).toBe('KLAS-RESMI/42/2026/AGENDA-RESMI');
  });

  it('derives yearly sequence periods in Asia/Jakarta', () => {
    expect(
      getRejectionLetterPeriodKey(
        'TAHUNAN',
        new Date('2026-12-31T17:00:00.000Z'),
      ),
    ).toBe('2027');
    expect(
      getRejectionLetterPeriodKey(
        'TIDAK_PERNAH',
        new Date('2026-12-31T17:00:00.000Z'),
      ),
    ).toBe('TETAP');
  });

  it.each([
    { format: '', classificationCode: 'X', agendaScope: 'A' },
    {
      format: '{{classification}}/{{year}}',
      classificationCode: 'X',
      agendaScope: 'A',
    },
    {
      format: '{{classification}}/{{sequence}}/{{unknown}}',
      classificationCode: 'X',
      agendaScope: 'A',
    },
    {
      format: '{{classification}}/{{sequence}}',
      classificationCode: '',
      agendaScope: 'A',
    },
  ])(
    'rejects missing or unsupported official number configuration',
    (input) => {
      expect(() =>
        renderRejectionLetterNumber({
          ...input,
          sequence: 1,
          date: new Date('2026-06-01T00:00:00.000Z'),
        }),
      ).toThrow();
    },
  );
});
