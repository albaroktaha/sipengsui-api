import { ExcelRows } from '../interfaces/excel-row.interface';

export abstract class BaseParser {
  // ==========================
  // Helper
  // ==========================

  protected static findCell(
    rows: ExcelRows,
    keyword: string,
  ): { row: number; col: number } | null {
    const target = keyword.replace(':', '').trim().toLowerCase();

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const text = String(rows[r][c] ?? '')
          .replace(':', '')
          .trim()
          .toLowerCase();

        if (text === target) {
          return {
            row: r,
            col: c,
          };
        }
      }
    }

    return null;
  }

  protected static findRow(rows: ExcelRows, keyword: string): number {
    const target = keyword.toLowerCase().trim();

    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const cell = String(rows[r][c] ?? '')
          .toLowerCase()
          .trim();

        if (cell === target) {
          return r;
        }
      }
    }

    return -1;
  }

  protected static findColumn(
    rows: ExcelRows,
    rowIndex: number,
    keyword: string,
  ): number {
    if (rowIndex < 0 || rowIndex >= rows.length) {
      return -1;
    }

    const target = keyword.toLowerCase().trim();

    const row = rows[rowIndex];

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '')
        .toLowerCase()
        .trim();

      if (cell === target) {
        return c;
      }
    }

    return -1;
  }

  protected static getValue(rows: ExcelRows, keyword: string): string {
    const cell = this.findCell(rows, keyword);

    if (!cell) {
      return '';
    }

    return String(rows[cell.row][cell.col + 1] ?? '').trim();
  }

  protected static normalizeNumber(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const text = String(value).replace(',', '.').trim();

    if (text === '' || text === '-') {
      return null;
    }

    const number = Number(text);

    return Number.isNaN(number) ? null : number;
  }
}
