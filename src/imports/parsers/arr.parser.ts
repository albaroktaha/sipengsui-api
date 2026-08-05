import { ArrMetadata } from '../interfaces/arr-metadata.interface';
import { ArrParserResult } from '../interfaces/arr-parser-result.interface';

import { BaseParser } from './base.parser';

import { ObservationImportDto } from '../dto/observation-import.dto';
import { ExcelCell, ExcelRows } from '../interfaces/excel-row.interface';

export class ArrParser extends BaseParser {
  static parse(rows: ExcelRows): ArrParserResult {
    const metadata = this.parseMetadata(rows);
    const observations = this.parseObservations(rows, metadata);

    return {
      metadata,
      observations,
      summary: null,
    };
  }

  private static parseMetadata(rows: ExcelRows): ArrMetadata {
    return {
      stationName: this.getValue(rows, 'Nama Stasiun'),
      stationCode: this.getValue(rows, 'No Stasiun'),
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
      readingMethod: this.getValue(rows, 'Pembacaan'),
    };
  }

  private static parseObservations(
    rows: ExcelRows,
    metadata: ArrMetadata,
  ): ObservationImportDto[] {
    const observations: ObservationImportDto[] = [];

    const headerRow = this.findRow(rows, 'Tanggal');

    if (headerRow === -1) {
      return observations;
    }

    const startRow = headerRow + 2;

    const period = this.detectPeriod(rows);

    const daysInMonth = new Date(period.year, period.month, 0).getDate();

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];

      if (!row) {
        break;
      }

      // kolom tanggal kosong
      if (row[0] === null || row[0] === '') {
        break;
      }

      const day = Number(row[0]);

      // bukan angka
      if (Number.isNaN(day)) {
        break;
      }

      // hari tidak valid
      if (day < 1 || day > daysInMonth) {
        break;
      }

      const rainfall = this.normalizeNumber(row[1]);

      const observationDate = new Date(
        period.year,
        period.month - 1,
        day,
        period.hour,
        period.minute,
        0,
      );

      observations.push({
        row: i + 1,
        observationDate,
        rainfall: rainfall ?? undefined,
        waterLevel: undefined,
        discharge: undefined,
        observerName: metadata.operator,
        note: String(row[3] ?? '').trim(),
        valid: true,
        errors: [],
      });
    }

    return observations;
  }

  // ==========================
  // Helper
  // ==========================

  private static normalizeKey(value: ExcelCell): string {
    return String(value ?? '')
      .replace(':', '')
      .trim()
      .toLowerCase();
  }

  private static normalizeString(value: ExcelCell): string {
    return String(value ?? '').trim();
  }

  private static excelDateToDate(value: number): Date {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }

  private static detectPeriod(rows: ExcelRows) {
    let title = '';

    for (const row of rows) {
      for (const cell of row) {
        const text = String(cell ?? '').toUpperCase();

        if (text.includes('BULAN')) {
          title = text;
          break;
        }
      }

      if (title) {
        break;
      }
    }

    let month = 1;

    const months: Record<string, number> = {
      JANUARI: 1,
      FEBRUARI: 2,
      MARET: 3,
      APRIL: 4,
      MEI: 5,
      JUNI: 6,
      JULI: 7,
      AGUSTUS: 8,
      SEPTEMBER: 9,
      OKTOBER: 10,
      NOVEMBER: 11,
      DESEMBER: 12,
    };

    for (const [name, value] of Object.entries(months)) {
      if (title.includes(name)) {
        month = value;
        break;
      }
    }

    const yearMatch = title.match(/20\d{2}/);

    const year = yearMatch ? Number(yearMatch[0]) : new Date().getFullYear();

    return {
      year,
      month,
      hour: 7,
      minute: 0,
    };
  }
}
