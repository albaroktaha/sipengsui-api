import { ObservationImportDto } from '../dto/observation-import.dto';

import { BaseParser } from './base.parser';

import { AwlrMetadata } from '../interfaces/awlr-metadata.interface';
import { AwlrParserResult } from '../interfaces/awlr-parser-result.interface';

import { ExcelRows, ExcelRow } from '../interfaces/excel-row.interface';

export class AwlrParser extends BaseParser {
  static parse(rows: ExcelRows, filename?: string): AwlrParserResult {
    const metadata = this.parseMetadata(rows, filename);

    const observations = this.parseObservations(rows, metadata);

    return {
      metadata,
      observations,
      summary: null,
    };
  }

  private static parseMetadata(
    rows: ExcelRows,
    filename?: string,
  ): AwlrMetadata {
    const period = this.detectPeriod(rows, filename);

    return {
      stationName: this.getValue(rows, 'Nama Stasiun'),
      stationCode: this.getValue(rows, 'No Stasiun'),
      riverName: this.getValue(rows, 'Nama Sungai'),

      installationYear:
        this.normalizeNumber(this.getValue(rows, 'Th. Pendirian')) ?? undefined,

      operationYear:
        this.normalizeNumber(this.getValue(rows, 'Thn. Operasi')) ?? undefined,

      operator: this.getValue(rows, 'Operator'),

      province: this.getValue(rows, 'Provinsi'),
      regency: this.getValue(rows, 'Kabupaten'),
      district: this.getValue(rows, 'Kecamatan'),
      village: this.getValue(rows, 'Desa'),

      latitude: this.getValue(rows, 'Lintang Utara'),
      longitude: this.getValue(rows, 'Bujur Timur'),

      readingMethod: 'Grafik',

      month: period.month,
      year: period.year,
    };
  }

  private static parseObservations(
    rows: ExcelRows,
    metadata: AwlrMetadata,
  ): ObservationImportDto[] {
    const observations: ObservationImportDto[] = [];

    const period = {
      month: metadata.month,
      year: metadata.year,
    };

    const daysInMonth = new Date(period.year, period.month, 0).getDate();

    // Header jam berada di baris ke-13 Excel (index 12)
    const timeColumns = this.detectTimeColumns(rows[12]);

    const AWLR_COLUMN = {
      DAY: 0,
      MORNING: 1,
      NOON: 2,
      EVENING: 3,
      AVERAGE: 4,
      NOTE: 5,
      MIN: 6,
      MAX: 7,
    } as const;

    const averageColumn = AWLR_COLUMN.AVERAGE;
    const noteColumn = AWLR_COLUMN.NOTE;

    // Data mulai baris ke-14 Excel (index 13)
    for (let r = 13; r < rows.length; r++) {
      const row = rows[r];

      if (!row) {
        break;
      }

      const firstCell = String(row[0] ?? '').trim();

      // selesai data
      if (
        firstCell === '' ||
        firstCell.toUpperCase().startsWith('TINGGI') ||
        firstCell.toUpperCase().startsWith('JUMLAH') ||
        firstCell.toUpperCase().startsWith('RATA')
      ) {
        break;
      }

      const day = Number(firstCell);

      if (Number.isNaN(day)) {
        break;
      }

      if (day < 1 || day > daysInMonth) {
        break;
      }

      const details: ObservationImportDto['details'] = [];

      for (const column of timeColumns) {
        details.push({
          observationTime: column.time,
          waterLevel: this.normalizeNumber(row[column.column]) ?? undefined,
          note: row[noteColumn] != null ? String(row[noteColumn]) : undefined,
        });
      }

      observations.push({
        row: r + 1,

        observationDate: new Date(
          `${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        ),

        rainfall: undefined,

        waterLevel: this.normalizeNumber(row[averageColumn]) ?? undefined,

        discharge: undefined,

        details,

        observerName: metadata.operator,

        note: row[noteColumn] != null ? String(row[noteColumn]) : undefined,

        valid: true,

        errors: [],
      });
    }

    return observations;
  }

  private static detectPeriod(rows: ExcelRows, filename?: string) {
    let month = 1;
    let year = new Date().getFullYear();

    const months: Record<string, number> = {
      JAN: 1,
      FEB: 2,
      MAR: 3,
      APR: 4,
      MEI: 5,
      JUN: 6,
      JUL: 7,
      AGU: 8,
      SEP: 9,
      OKT: 10,
      NOV: 11,
      DES: 12,
    };

    const monthText = this.getValue(rows, 'Bulan').toUpperCase();

    for (const [key, value] of Object.entries(months)) {
      if (monthText.includes(key)) {
        month = value;
        break;
      }
    }

    const yearMatch = monthText.match(/20\d{2}/);

    if (yearMatch) {
      year = Number(yearMatch[0]);
    } else if (filename) {
      const fileYear = filename.match(/20\d{2}/);

      if (fileYear) {
        year = Number(fileYear[0]);
      }
    }

    return {
      month,
      year,
    };
  }

  private static detectTimeColumns(header: ExcelRow): {
    column: number;
    time: string;
  }[] {
    const columns: {
      column: number;
      time: string;
    }[] = [];

    const regex = /(\d{1,2})[.:](\d{2})/;

    for (let i = 0; i < header.length; i++) {
      const text = String(header[i] ?? '');

      const match = text.match(regex);

      if (!match) {
        continue;
      }

      columns.push({
        column: i,
        time: `${match[1].padStart(2, '0')}:${match[2]}`,
      });
    }

    return columns;
  }
}
