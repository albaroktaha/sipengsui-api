export interface AwlrMetadata {
  stationName: string;
  stationCode: string;

  installationYear?: number;
  operationYear?: number;

  operator: string;

  province: string;
  regency: string;
  district: string;
  village: string;

  latitude: string;
  longitude: string;

  riverName: string;

  readingMethod: string;

  month: number;
  year: number;
}
