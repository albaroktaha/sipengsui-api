export interface ImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

export interface ImportMetadata {
  stationCode: string;
  stationName: string;
  month?: number;
  year?: number;
}
