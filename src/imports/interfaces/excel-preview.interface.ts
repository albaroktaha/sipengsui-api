import { ImportType } from '@prisma/client';
import { ObservationImportDto } from '../dto/observation-import.dto';
import { ImportMetadata, ImportSummary } from './draft.interface';

export interface ExcelPreview {
  filename: string;
  sheet: string;
  totalRows: number;
  importType: ImportType;

  metadata: ImportMetadata;

  summary: ImportSummary;

  rows: ObservationImportDto[];
}
