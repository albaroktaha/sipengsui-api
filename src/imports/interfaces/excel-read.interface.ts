import * as XLSX from 'xlsx';
import { ExcelRows } from './excel-row.interface';

export interface ExcelReadResult {
  workbook: XLSX.WorkBook;
  worksheet: XLSX.WorkSheet;
  sheetName: string;
  rows: ExcelRows;
}
