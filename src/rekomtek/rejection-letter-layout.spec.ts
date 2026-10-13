import {
  DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG,
  resolveRejectionLetterLayoutConfig,
} from './rejection-letter-layout';

describe('resolveRejectionLetterLayoutConfig', () => {
  it('omits the standalone city/date block from the default letter layout', () => {
    expect(DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG.blockOrder).toEqual([
      'LETTERHEAD',
      'TITLE',
      'LETTER_META',
      'RECIPIENT',
      'BODY',
      'CLOSING',
      'SIGNATURE',
    ]);
  });

  it('normalizes legacy template orders by removing the standalone city/date block', () => {
    const legacy = {
      ...DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG,
      blockOrder: [
        'LETTERHEAD',
        'TITLE',
        'LETTER_META',
        'RECIPIENT',
        'BODY',
        'CLOSING',
        'DATE',
        'SIGNATURE',
      ],
    };

    expect(resolveRejectionLetterLayoutConfig(legacy).blockOrder).not.toContain(
      'DATE',
    );
  });

  it('rejects a malformed block order instead of silently using defaults', () => {
    const malformed = {
      ...DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG,
      blockOrder: 'BODY',
    } as unknown;

    expect(() => resolveRejectionLetterLayoutConfig(malformed)).toThrow(
      'Urutan blok tata letak surat tidak valid',
    );
  });

  it('fills drag-and-drop fields for older template snapshots', () => {
    const legacy: Record<string, unknown> = {
      ...DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG,
    };
    delete legacy.blockOrder;
    delete legacy.blockAlignments;

    expect(resolveRejectionLetterLayoutConfig(legacy)).toMatchObject({
      blockOrder: DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG.blockOrder,
      blockAlignments: DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG.blockAlignments,
    });
  });
});
