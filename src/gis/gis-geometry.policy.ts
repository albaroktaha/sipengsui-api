import { BadRequestException } from '@nestjs/common';
import {
  GeoJsonGeometryType,
  GeoJsonValidationReport,
  validateGeoJson,
} from './gis-geometry.validator';

export function assertGeoJsonGeometry(
  value: unknown,
  allowedGeometryTypes: readonly GeoJsonGeometryType[],
  label: string,
): GeoJsonValidationReport | null {
  if (value === undefined || value === null) return null;
  const report = validateGeoJson(value, { allowedGeometryTypes });
  if (!report.valid) {
    throw new BadRequestException({
      message: `Geometri ${label} tidak valid`,
      validation: report,
    });
  }
  return report;
}
