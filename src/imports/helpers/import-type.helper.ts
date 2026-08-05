import { ImportType } from '@prisma/client';

export class ImportTypeHelper {
  static detect(rows: any[][]): ImportType {
    const text = rows
      .flat()
      .map((x) => String(x ?? '').toUpperCase())
      .join(' ');

    if (text.includes('DATA TINGGI MUKA AIR HARIAN')) {
      return ImportType.AWLR;
    }

    if (text.includes('DATA HUJAN HARIAN')) {
      return ImportType.ARR;
    }

    throw new Error('Format Excel tidak dikenali.');
  }
}
