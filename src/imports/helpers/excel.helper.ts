import * as XLSX from 'xlsx';

import { ExcelReadResult } from '../interfaces/excel-read.interface';
import { ExcelRows } from '../interfaces/excel-row.interface';

export class ExcelHelper {
  static read(file: Express.Multer.File): ExcelReadResult {
    const workbook = XLSX.read(file.buffer, {
      type: 'buffer',
    });

    const sheetName = workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: null,
    }) as unknown as ExcelRows;

    return {
      workbook,
      sheetName,
      worksheet,
      rows,
    };
  }
}
