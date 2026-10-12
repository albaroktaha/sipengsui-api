const EARTH_RADIUS_METERS = 6_371_000;
export const MAX_RIVER_MATCH_DISTANCE_METERS = 250;

type GeoJsonRecord = Record<string, unknown>;
type Position = [number, number];

export interface RiverRegionGeometryRecord {
  id: string;
  name: string;
  geometry: unknown;
}

export interface WatershedGeometryRecord {
  id: string;
  name: string;
  riverRegionId: string;
  area: number | null;
  geometry: unknown;
}

export interface RiverGeometryRecord {
  id: string;
  name: string;
  watershedId: string;
  geometry: unknown;
}

export interface ResolvedGeographicReference {
  riverRegion: { id: string; name: string } | null;
  watershed: { id: string; name: string; riverRegionId: string } | null;
  river: { id: string; name: string; watershedId: string } | null;
}

function isRecord(value: unknown): value is GeoJsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPosition(value: unknown): Position | null {
  if (
    !Array.isArray(value) ||
    typeof value[0] !== 'number' ||
    typeof value[1] !== 'number'
  ) {
    return null;
  }
  return [value[0], value[1]];
}

function geometryParts(value: unknown): GeoJsonRecord[] {
  if (!isRecord(value)) return [];
  if (value.type === 'Feature') {
    return geometryParts(value.geometry);
  }
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) {
    return value.features.flatMap((feature) => geometryParts(feature));
  }
  return [value];
}

function pointOnSegment(
  x: number,
  y: number,
  start: Position,
  end: Position,
): boolean {
  const cross =
    (x - start[0]) * (end[1] - start[1]) - (y - start[1]) * (end[0] - start[0]);
  if (Math.abs(cross) > 1e-10) return false;
  return (
    x >= Math.min(start[0], end[0]) - 1e-10 &&
    x <= Math.max(start[0], end[0]) + 1e-10 &&
    y >= Math.min(start[1], end[1]) - 1e-10 &&
    y <= Math.max(start[1], end[1]) + 1e-10
  );
}

function pointInRing(
  longitude: number,
  latitude: number,
  value: unknown,
): boolean {
  if (!Array.isArray(value)) return false;
  const positions = value.map(asPosition);
  if (positions.length < 3 || positions.some((position) => position === null)) {
    return false;
  }
  const ring = positions as Position[];
  let inside = false;

  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const currentPosition = ring[index];
    const previousPosition = ring[previous];
    if (
      pointOnSegment(longitude, latitude, previousPosition, currentPosition)
    ) {
      return true;
    }

    const crossesLatitude =
      currentPosition[1] > latitude !== previousPosition[1] > latitude;
    if (!crossesLatitude) continue;

    const crossingLongitude =
      ((previousPosition[0] - currentPosition[0]) *
        (latitude - currentPosition[1])) /
        (previousPosition[1] - currentPosition[1]) +
      currentPosition[0];
    if (longitude < crossingLongitude) inside = !inside;
  }

  return inside;
}

function pointInPolygonCoordinates(
  longitude: number,
  latitude: number,
  value: unknown,
): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const coordinates: unknown[] = value;
  const outerRing = coordinates[0];
  const holes = coordinates.slice(1);
  return (
    pointInRing(longitude, latitude, outerRing) &&
    !holes.some((hole) => pointInRing(longitude, latitude, hole))
  );
}

function geometryContainsPoint(
  geometry: GeoJsonRecord,
  longitude: number,
  latitude: number,
): boolean {
  if (geometry.type === 'Polygon') {
    return pointInPolygonCoordinates(longitude, latitude, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.some((polygon) =>
      pointInPolygonCoordinates(longitude, latitude, polygon),
    );
  }
  if (
    geometry.type === 'GeometryCollection' &&
    Array.isArray(geometry.geometries)
  ) {
    return geometry.geometries.some(
      (part) =>
        isRecord(part) && geometryContainsPoint(part, longitude, latitude),
    );
  }
  return false;
}

function geometryContains(
  value: unknown,
  longitude: number,
  latitude: number,
): boolean {
  return geometryParts(value).some((geometry) =>
    geometryContainsPoint(geometry, longitude, latitude),
  );
}

function distanceToSegmentMeters(
  longitude: number,
  latitude: number,
  start: Position,
  end: Position,
): number {
  const latitudeScale = Math.cos((latitude * Math.PI) / 180);
  const toMetersX = (value: number) =>
    ((value * Math.PI) / 180) * EARTH_RADIUS_METERS * latitudeScale;
  const toMetersY = (value: number) =>
    ((value * Math.PI) / 180) * EARTH_RADIUS_METERS;
  const pointX = toMetersX(longitude);
  const pointY = toMetersY(latitude);
  const startX = toMetersX(start[0]);
  const startY = toMetersY(start[1]);
  const endX = toMetersX(end[0]);
  const endY = toMetersY(end[1]);
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const projection =
    segmentLengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((pointX - startX) * segmentX + (pointY - startY) * segmentY) /
              segmentLengthSquared,
          ),
        );
  const nearestX = startX + projection * segmentX;
  const nearestY = startY + projection * segmentY;
  return Math.hypot(pointX - nearestX, pointY - nearestY);
}

function lineDistanceMeters(
  longitude: number,
  latitude: number,
  value: unknown,
): number | null {
  if (!Array.isArray(value)) return null;
  const positions = value.map(asPosition);
  if (
    positions.length === 0 ||
    positions.some((position) => position === null)
  ) {
    return null;
  }
  const line = positions as Position[];
  if (line.length === 1) {
    return distanceToSegmentMeters(longitude, latitude, line[0], line[0]);
  }

  let minimumDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    minimumDistance = Math.min(
      minimumDistance,
      distanceToSegmentMeters(
        longitude,
        latitude,
        line[index - 1],
        line[index],
      ),
    );
  }
  return minimumDistance;
}

function geometryLineDistanceMeters(
  geometry: GeoJsonRecord,
  longitude: number,
  latitude: number,
): number | null {
  if (geometry.type === 'LineString') {
    return lineDistanceMeters(longitude, latitude, geometry.coordinates);
  }
  if (
    geometry.type === 'MultiLineString' &&
    Array.isArray(geometry.coordinates)
  ) {
    const distances = geometry.coordinates
      .map((line) => lineDistanceMeters(longitude, latitude, line))
      .filter((distance): distance is number => distance !== null);
    return distances.length > 0 ? Math.min(...distances) : null;
  }
  if (
    geometry.type === 'GeometryCollection' &&
    Array.isArray(geometry.geometries)
  ) {
    const distances = geometry.geometries
      .filter(isRecord)
      .map((part) => geometryLineDistanceMeters(part, longitude, latitude))
      .filter((distance): distance is number => distance !== null);
    return distances.length > 0 ? Math.min(...distances) : null;
  }
  return null;
}

function geometryDistanceToLineMeters(
  value: unknown,
  longitude: number,
  latitude: number,
): number | null {
  const distances = geometryParts(value)
    .map((geometry) =>
      geometryLineDistanceMeters(geometry, longitude, latitude),
    )
    .filter((distance): distance is number => distance !== null);
  return distances.length > 0 ? Math.min(...distances) : null;
}

export function resolveGeographicReferenceAtPoint(
  latitude: number,
  longitude: number,
  riverRegions: RiverRegionGeometryRecord[],
  watersheds: WatershedGeometryRecord[],
  rivers: RiverGeometryRecord[],
): ResolvedGeographicReference {
  const containingWatersheds = watersheds
    .filter((watershed) =>
      geometryContains(watershed.geometry, longitude, latitude),
    )
    .sort((left, right) => (left.area ?? Infinity) - (right.area ?? Infinity));
  const containingWatershed = containingWatersheds[0] ?? null;

  const containingRiverRegions = riverRegions.filter((region) =>
    geometryContains(region.geometry, longitude, latitude),
  );
  let riverRegion = containingRiverRegions[0] ?? null;

  const allowedWatershedIds = new Set(
    containingWatershed
      ? [containingWatershed.id]
      : containingRiverRegions.length > 0
        ? watersheds
            .filter((watershed) =>
              containingRiverRegions.some(
                (region) => region.id === watershed.riverRegionId,
              ),
            )
            .map((watershed) => watershed.id)
        : [],
  );
  const riverCandidates =
    allowedWatershedIds.size > 0
      ? rivers.filter((river) => allowedWatershedIds.has(river.watershedId))
      : rivers;
  const nearestRiver = riverCandidates
    .map((river) => ({
      river,
      distance: geometryDistanceToLineMeters(
        river.geometry,
        longitude,
        latitude,
      ),
    }))
    .filter(
      (
        candidate,
      ): candidate is { river: RiverGeometryRecord; distance: number } =>
        candidate.distance !== null,
    )
    .sort((left, right) => left.distance - right.distance)[0];
  const river =
    nearestRiver && nearestRiver.distance <= MAX_RIVER_MATCH_DISTANCE_METERS
      ? nearestRiver.river
      : null;

  let watershed = containingWatershed;
  if (river) {
    watershed =
      watersheds.find((candidate) => candidate.id === river.watershedId) ??
      watershed;
  }
  if (watershed) {
    riverRegion =
      riverRegions.find(
        (candidate) => candidate.id === watershed.riverRegionId,
      ) ?? riverRegion;
  }

  return {
    riverRegion: riverRegion
      ? { id: riverRegion.id, name: riverRegion.name }
      : null,
    watershed: watershed
      ? {
          id: watershed.id,
          name: watershed.name,
          riverRegionId: watershed.riverRegionId,
        }
      : null,
    river: river
      ? { id: river.id, name: river.name, watershedId: river.watershedId }
      : null,
  };
}
