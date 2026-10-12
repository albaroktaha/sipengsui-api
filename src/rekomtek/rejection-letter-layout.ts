export type RejectionLetterPageSize = 'A4' | 'F4';
export type RejectionLetterAlignment = 'LEFT' | 'CENTER' | 'RIGHT';
export type RejectionLetterTextAlignment = RejectionLetterAlignment | 'JUSTIFY';
export type RejectionLetterLogoPosition = 'LEFT' | 'RIGHT';
export const REJECTION_LETTER_LAYOUT_BLOCKS = [
  'LETTERHEAD',
  'TITLE',
  'DATE',
  'LETTER_META',
  'RECIPIENT',
  'BODY',
  'CLOSING',
  'SIGNATURE',
] as const;
export type RejectionLetterLayoutBlockId =
  (typeof REJECTION_LETTER_LAYOUT_BLOCKS)[number];
export type RejectionLetterAlignedBlockId = Exclude<
  RejectionLetterLayoutBlockId,
  'LETTERHEAD'
>;

export interface RejectionLetterLayoutConfig {
  pageSize: RejectionLetterPageSize;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  bodyFontSizePt: number;
  bodyLineGapPt: number;
  paragraphSpacingPt: number;
  headerAlignment: RejectionLetterAlignment;
  logoPosition: RejectionLetterLogoPosition;
  blockOrder: RejectionLetterLayoutBlockId[];
  blockAlignments: Partial<
    Record<RejectionLetterAlignedBlockId, RejectionLetterTextAlignment>
  >;
}

export const DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG: RejectionLetterLayoutConfig =
  {
    pageSize: 'A4',
    marginTopMm: 18.344,
    marginRightMm: 22.578,
    marginBottomMm: 19.756,
    marginLeftMm: 22.578,
    bodyFontSizePt: 10,
    bodyLineGapPt: 2,
    paragraphSpacingPt: 4,
    headerAlignment: 'CENTER',
    logoPosition: 'LEFT',
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
    blockAlignments: {
      TITLE: 'CENTER',
      DATE: 'RIGHT',
      LETTER_META: 'LEFT',
      RECIPIENT: 'LEFT',
      BODY: 'JUSTIFY',
      CLOSING: 'JUSTIFY',
      SIGNATURE: 'RIGHT',
    },
  };

const POINTS_PER_MM = 72 / 25.4;
const ALIGNMENTS: RejectionLetterAlignment[] = ['LEFT', 'CENTER', 'RIGHT'];
const TEXT_ALIGNMENTS: RejectionLetterTextAlignment[] = [
  ...ALIGNMENTS,
  'JUSTIFY',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNumberRange(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${field} harus di antara ${minimum} dan ${maximum}`);
  }
}

export function resolveRejectionLetterLayoutConfig(
  value: unknown,
): RejectionLetterLayoutConfig {
  if (value === undefined || value === null) {
    return {
      ...DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG,
      blockOrder: [...DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG.blockOrder],
      blockAlignments: {
        ...DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG.blockAlignments,
      },
    };
  }
  if (!isRecord(value)) {
    throw new Error('Pengaturan tata letak surat tidak valid');
  }

  const layout = {
    ...DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG,
    ...value,
  };

  if (layout.pageSize !== 'A4' && layout.pageSize !== 'F4') {
    throw new Error('Ukuran kertas surat harus A4 atau F4');
  }
  assertNumberRange(layout.marginTopMm, 'Margin atas', 10, 40);
  assertNumberRange(layout.marginRightMm, 'Margin kanan', 10, 40);
  assertNumberRange(layout.marginBottomMm, 'Margin bawah', 10, 40);
  assertNumberRange(layout.marginLeftMm, 'Margin kiri', 10, 40);
  assertNumberRange(layout.bodyFontSizePt, 'Ukuran font isi', 8, 14);
  assertNumberRange(layout.bodyLineGapPt, 'Jarak baris', 0, 8);
  assertNumberRange(layout.paragraphSpacingPt, 'Jarak paragraf', 0, 24);
  if (!ALIGNMENTS.includes(layout.headerAlignment)) {
    throw new Error('Perataan kop surat tidak valid');
  }
  if (layout.logoPosition !== 'LEFT' && layout.logoPosition !== 'RIGHT') {
    throw new Error('Posisi logo harus di kiri atau kanan');
  }

  if (
    value.blockOrder !== undefined &&
    value.blockOrder !== null &&
    !Array.isArray(value.blockOrder)
  ) {
    throw new Error('Urutan blok tata letak surat tidak valid');
  }
  const rawBlockOrder: unknown[] = Array.isArray(value.blockOrder)
    ? value.blockOrder
    : DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG.blockOrder;
  if (
    rawBlockOrder.length !== REJECTION_LETTER_LAYOUT_BLOCKS.length ||
    new Set(rawBlockOrder).size !== REJECTION_LETTER_LAYOUT_BLOCKS.length ||
    REJECTION_LETTER_LAYOUT_BLOCKS.some(
      (block) => !rawBlockOrder.includes(block),
    )
  ) {
    throw new Error('Urutan blok tata letak surat tidak valid');
  }
  const blockOrder = rawBlockOrder as RejectionLetterLayoutBlockId[];

  if (
    value.blockAlignments !== undefined &&
    value.blockAlignments !== null &&
    !isRecord(value.blockAlignments)
  ) {
    throw new Error('Perataan blok tata letak surat tidak valid');
  }
  const rawAlignments = isRecord(value.blockAlignments)
    ? value.blockAlignments
    : {};
  const blockAlignments = {
    ...DEFAULT_REJECTION_LETTER_LAYOUT_CONFIG.blockAlignments,
  };
  for (const [block, alignment] of Object.entries(rawAlignments)) {
    if (
      block === 'LETTERHEAD' ||
      !REJECTION_LETTER_LAYOUT_BLOCKS.includes(
        block as RejectionLetterLayoutBlockId,
      ) ||
      !TEXT_ALIGNMENTS.includes(alignment as RejectionLetterTextAlignment)
    ) {
      throw new Error('Perataan blok tata letak surat tidak valid');
    }
    blockAlignments[block as RejectionLetterAlignedBlockId] =
      alignment as RejectionLetterTextAlignment;
  }

  return { ...layout, blockOrder: [...blockOrder], blockAlignments };
}

export function getRejectionLetterPdfLayout(value: unknown): {
  size: 'A4' | [number, number];
  margins: { top: number; right: number; bottom: number; left: number };
} {
  const layout = resolveRejectionLetterLayoutConfig(value);
  const size: 'A4' | [number, number] =
    layout.pageSize === 'A4'
      ? 'A4'
      : [21.5 * POINTS_PER_MM, 33 * POINTS_PER_MM];

  return {
    size,
    margins: {
      top: layout.marginTopMm * POINTS_PER_MM,
      right: layout.marginRightMm * POINTS_PER_MM,
      bottom: layout.marginBottomMm * POINTS_PER_MM,
      left: layout.marginLeftMm * POINTS_PER_MM,
    },
  };
}
