import {
  DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG,
  resolveRejectionLetterLayoutConfig,
} from './rejection-letter-layout';

describe('resolveRejectionLetterLayoutConfig', () => {
  it('keeps the date immediately before the signer by default', () => {
    expect(DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG.blockOrder).toEqual([
      'LETTERHEAD',
      'TITLE',
      'LETTER_META',
      'RECIPIENT',
      'BODY',
      'CLOSING',
      'DATE',
      'SIGNATURE',
    ]);
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
