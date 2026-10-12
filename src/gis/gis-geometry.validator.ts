export type GeoJsonGeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon'
  | 'GeometryCollection';

export const GIS_CATEGORY_GEOMETRY_TYPES: Readonly<
  Record<string, readonly GeoJsonGeometryType[]>
> = {
  PETA_POS_HIDROLOGI: ['Point', 'MultiPoint'],
  PETA_WILAYAH_SUNGAI: ['Polygon', 'MultiPolygon'],
  PETA_DAERAH_ALIRAN_SUNGAI: ['Polygon', 'MultiPolygon'],
  PETA_SUNGAI: ['LineString', 'MultiLineString'],
  PETA_JARINGAN_IRIGASI: [
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
  ],
};

export const GIS_MASTER_GEOMETRY_TYPES = {
  RIVER_REGION: ['Polygon', 'MultiPolygon'],
  WATERSHED: ['Polygon', 'MultiPolygon'],
  RIVER: ['LineString', 'MultiLineString'],
} as const satisfies Record<
  'RIVER_REGION' | 'WATERSHED' | 'RIVER',
  readonly GeoJsonGeometryType[]
>;

export interface GeoJsonValidationIssue {
  code: string;
  message: string;
  path: string;
  featureIndex?: number;
}

export interface GeoJsonValidationOptions {
  allowedGeometryTypes?: readonly GeoJsonGeometryType[];
  maxFeatures?: number;
  maxCoordinates?: number;
  maxDepth?: number;
  maxRingPositions?: number;
}

export interface GeoJsonValidationReport {
  valid: boolean;
  featureCount: number;
  validFeatureCount: number;
  invalidFeatureCount: number;
  coordinateCount: number;
  geometryTypes: GeoJsonGeometryType[];
  errors: GeoJsonValidationIssue[];
}

const DEFAULT_LIMITS = {
  maxFeatures: 50_000,
  maxCoordinates: 250_000,
  maxDepth: 16,
  maxRingPositions: 2_000,
} as const;

type Position = number[];
type ValidatorContext = {
  options: {
    maxFeatures: number;
    maxCoordinates: number;
    maxDepth: number;
    maxRingPositions: number;
  };
  allowedGeometryTypes?: readonly GeoJsonGeometryType[];
  geometryTypes: Set<GeoJsonGeometryType>;
  errors: GeoJsonValidationIssue[];
  coordinateCount: number;
};

/** Strict GeoJSON structure, coordinate, and target-type validation. No repair is performed. */
export function validateGeoJson(
  value: unknown,
  options: GeoJsonValidationOptions = {},
): GeoJsonValidationReport {
  const context: ValidatorContext = {
    options: {
      maxFeatures: positiveLimit(
        options.maxFeatures,
        DEFAULT_LIMITS.maxFeatures,
      ),
      maxCoordinates: positiveLimit(
        options.maxCoordinates,
        DEFAULT_LIMITS.maxCoordinates,
      ),
      maxDepth: positiveLimit(options.maxDepth, DEFAULT_LIMITS.maxDepth),
      maxRingPositions: positiveLimit(
        options.maxRingPositions,
        DEFAULT_LIMITS.maxRingPositions,
      ),
    },
    allowedGeometryTypes: options.allowedGeometryTypes,
    geometryTypes: new Set(),
    errors: [],
    coordinateCount: 0,
  };
  const root = asRecord(value);
  let featureCount = 0;
  let validFeatureCount = 0;
  let invalidFeatureCount = 0;

  if (!root) {
    addError(context, 'invalid_geojson', 'GeoJSON harus berupa objek.', '$');
  } else if (root.type === 'FeatureCollection') {
    if (!Array.isArray(root.features)) {
      addError(
        context,
        'invalid_feature_collection',
        'features harus berupa array.',
        '$.features',
      );
    } else if (root.features.length > context.options.maxFeatures) {
      addError(
        context,
        'feature_limit_exceeded',
        `Jumlah fitur melebihi batas ${context.options.maxFeatures}.`,
        '$.features',
      );
    } else {
      featureCount = root.features.length;
      if (featureCount === 0) {
        addError(
          context,
          'empty_feature_collection',
          'FeatureCollection tidak berisi fitur.',
          '$.features',
        );
      }
      root.features.forEach((candidate, index) => {
        const before = context.errors.length;
        const feature = asRecord(candidate);
        const path = `$.features[${index}]`;
        if (!feature || feature.type !== 'Feature') {
          addError(
            context,
            'invalid_feature',
            'Item harus berupa GeoJSON Feature.',
            path,
            index,
          );
        } else {
          const properties = feature.properties;
          if (properties !== null && asRecord(properties) === null) {
            addError(
              context,
              'invalid_feature_properties',
              'properties harus berupa objek atau null.',
              `${path}.properties`,
              index,
            );
          }
          if (feature.geometry === null) {
            addError(
              context,
              'missing_geometry',
              'Fitur tidak memiliki geometri.',
              `${path}.geometry`,
              index,
            );
          } else {
            validateGeometry(
              feature.geometry,
              `${path}.geometry`,
              context,
              0,
              index,
            );
          }
        }
        if (context.errors.length === before) validFeatureCount += 1;
        else invalidFeatureCount += 1;
      });
    }
  } else if (root.type === 'Feature') {
    featureCount = 1;
    const before = context.errors.length;
    if (root.geometry === null) {
      addError(
        context,
        'missing_geometry',
        'Fitur tidak memiliki geometri.',
        '$.geometry',
        0,
      );
    } else {
      validateGeometry(root.geometry, '$.geometry', context, 0, 0);
    }
    if (context.errors.length === before) validFeatureCount = 1;
    else invalidFeatureCount = 1;
  } else {
    featureCount = 1;
    const before = context.errors.length;
    validateGeometry(value, '$', context, 0);
    if (context.errors.length === before) validFeatureCount = 1;
    else invalidFeatureCount = 1;
  }

  if (context.coordinateCount > context.options.maxCoordinates) {
    addError(
      context,
      'coordinate_limit_exceeded',
      `Jumlah posisi koordinat melebihi batas ${context.options.maxCoordinates}.`,
      '$',
    );
  }

  return {
    valid: context.errors.length === 0 && validFeatureCount > 0,
    featureCount,
    validFeatureCount,
    invalidFeatureCount,
    coordinateCount: context.coordinateCount,
    geometryTypes: [...context.geometryTypes].sort(),
    errors: context.errors,
  };
}

function validateGeometry(
  value: unknown,
  path: string,
  context: ValidatorContext,
  depth: number,
  featureIndex?: number,
): void {
  if (depth > context.options.maxDepth) {
    addError(
      context,
      'geometry_depth_exceeded',
      'Kedalaman GeometryCollection terlalu besar.',
      path,
      featureIndex,
    );
    return;
  }
  const geometry = asRecord(value);
  if (!geometry || typeof geometry.type !== 'string') {
    addError(
      context,
      'invalid_geometry',
      'Geometri GeoJSON tidak valid.',
      path,
      featureIndex,
    );
    return;
  }
  const type = geometry.type as GeoJsonGeometryType;
  const supported: GeoJsonGeometryType[] = [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
    'GeometryCollection',
  ];
  if (!supported.includes(type)) {
    addError(
      context,
      'unsupported_geometry_type',
      `Tipe geometri ${geometry.type} tidak didukung.`,
      `${path}.type`,
      featureIndex,
    );
    return;
  }
  context.geometryTypes.add(type);
  if (
    type !== 'GeometryCollection' &&
    context.allowedGeometryTypes &&
    !context.allowedGeometryTypes.includes(type)
  ) {
    addError(
      context,
      'geometry_type_not_allowed',
      `Tipe geometri ${type} tidak sesuai untuk data ini.`,
      `${path}.type`,
      featureIndex,
    );
  }

  if (type === 'GeometryCollection') {
    if (
      !Array.isArray(geometry.geometries) ||
      geometry.geometries.length === 0
    ) {
      addError(
        context,
        'empty_geometry_collection',
        'GeometryCollection harus memiliki geometri.',
        `${path}.geometries`,
        featureIndex,
      );
      return;
    }
    geometry.geometries.forEach((item, index) =>
      validateGeometry(
        item,
        `${path}.geometries[${index}]`,
        context,
        depth + 1,
        featureIndex,
      ),
    );
    return;
  }

  const coordinates = geometry.coordinates;
  switch (type) {
    case 'Point':
      validatePosition(
        coordinates,
        `${path}.coordinates`,
        context,
        featureIndex,
      );
      return;
    case 'MultiPoint':
      validatePositionList(
        coordinates,
        `${path}.coordinates`,
        context,
        featureIndex,
        1,
      );
      return;
    case 'LineString':
      validateLine(coordinates, `${path}.coordinates`, context, featureIndex);
      return;
    case 'MultiLineString':
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        addError(
          context,
          'empty_multiline',
          'MultiLineString harus memiliki garis.',
          `${path}.coordinates`,
          featureIndex,
        );
        return;
      }
      coordinates.forEach((line, index) =>
        validateLine(
          line,
          `${path}.coordinates[${index}]`,
          context,
          featureIndex,
        ),
      );
      return;
    case 'Polygon':
      validatePolygon(
        coordinates,
        `${path}.coordinates`,
        context,
        featureIndex,
      );
      return;
    case 'MultiPolygon':
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        addError(
          context,
          'empty_multipolygon',
          'MultiPolygon harus memiliki poligon.',
          `${path}.coordinates`,
          featureIndex,
        );
        return;
      }
      coordinates.forEach((polygon, index) =>
        validatePolygon(
          polygon,
          `${path}.coordinates[${index}]`,
          context,
          featureIndex,
        ),
      );
  }
}

function validatePositionList(
  value: unknown,
  path: string,
  context: ValidatorContext,
  featureIndex: number | undefined,
  minimum: number,
): Position[] {
  if (!Array.isArray(value) || value.length < minimum) {
    addError(
      context,
      'invalid_coordinate_list',
      `Harus memiliki minimal ${minimum} posisi.`,
      path,
      featureIndex,
    );
    return [];
  }
  return value
    .map((item, index) =>
      validatePosition(item, `${path}[${index}]`, context, featureIndex),
    )
    .filter((position): position is Position => position !== null);
}

function validatePosition(
  value: unknown,
  path: string,
  context: ValidatorContext,
  featureIndex?: number,
): Position | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.some((coordinate) => typeof coordinate !== 'number')
  ) {
    addError(
      context,
      'invalid_position',
      'Posisi harus berisi minimal longitude dan latitude numerik.',
      path,
      featureIndex,
    );
    return null;
  }
  context.coordinateCount += 1;
  const position = value as number[];
  let invalid = false;
  if (position.some((coordinate) => !Number.isFinite(coordinate))) {
    addError(
      context,
      'coordinate_not_finite',
      'Koordinat harus berupa angka finite.',
      path,
      featureIndex,
    );
    invalid = true;
  }
  const [longitude, latitude] = position;
  if (Number.isFinite(longitude) && (longitude < -180 || longitude > 180)) {
    addError(
      context,
      'coordinate_longitude_out_of_range',
      'Longitude harus berada pada rentang -180 hingga 180.',
      path,
      featureIndex,
    );
    invalid = true;
  }
  if (Number.isFinite(latitude) && (latitude < -90 || latitude > 90)) {
    addError(
      context,
      'coordinate_latitude_out_of_range',
      'Latitude harus berada pada rentang -90 hingga 90.',
      path,
      featureIndex,
    );
    invalid = true;
  }
  return invalid ? null : position;
}

function validateLine(
  value: unknown,
  path: string,
  context: ValidatorContext,
  featureIndex?: number,
): Position[] {
  const positions = validatePositionList(value, path, context, featureIndex, 2);
  if (
    positions.length >= 2 &&
    !positions.some(
      (position) => !sameHorizontalPosition(position, positions[0]),
    )
  ) {
    addError(
      context,
      'line_degenerate',
      'Garis harus memiliki setidaknya dua posisi yang berbeda.',
      path,
      featureIndex,
    );
  }
  return positions;
}

function validatePolygon(
  value: unknown,
  path: string,
  context: ValidatorContext,
  featureIndex?: number,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    addError(
      context,
      'empty_polygon',
      'Polygon harus memiliki ring luar.',
      path,
      featureIndex,
    );
    return;
  }
  const rings = value.map((ring, ringIndex) => {
    const ringPath = `${path}[${ringIndex}]`;
    const positions = validatePositionList(
      ring,
      ringPath,
      context,
      featureIndex,
      4,
    );
    if (positions.length > context.options.maxRingPositions) {
      addError(
        context,
        'polygon_ring_too_complex',
        `Ring melebihi batas ${context.options.maxRingPositions} posisi untuk pemeriksaan topologi.`,
        ringPath,
        featureIndex,
      );
      return positions;
    }
    if (
      positions.length >= 4 &&
      !samePosition(positions[0], positions[positions.length - 1])
    ) {
      addError(
        context,
        'polygon_ring_not_closed',
        'Ring poligon harus tertutup.',
        ringPath,
        featureIndex,
      );
    }
    if (
      positions.length >= 4 &&
      Math.abs(signedArea(positions)) < Number.EPSILON
    ) {
      addError(
        context,
        'polygon_ring_degenerate',
        'Ring poligon tidak boleh memiliki luas nol.',
        ringPath,
        featureIndex,
      );
    }
    if (positions.length >= 4 && hasSelfIntersection(positions)) {
      addError(
        context,
        'polygon_ring_self_intersection',
        'Ring poligon berpotongan dengan dirinya sendiri.',
        ringPath,
        featureIndex,
      );
    }
    return positions;
  });

  if (rings[0]?.length >= 4) {
    for (let index = 1; index < rings.length; index += 1) {
      const hole = rings[index];
      if (
        hole.length >= 4 &&
        (!pointInRing(hole[0], rings[0]) || ringsIntersect(hole, rings[0]))
      ) {
        addError(
          context,
          'polygon_hole_outside_shell',
          'Ring lubang harus berada sepenuhnya di dalam ring luar dan tidak menyentuh batasnya.',
          `${path}[${index}]`,
          featureIndex,
        );
      }
      for (let other = 1; other < index; other += 1) {
        if (
          hole.length >= 4 &&
          rings[other].length >= 4 &&
          (pointInRing(hole[0], rings[other]) ||
            ringsIntersect(hole, rings[other]))
        ) {
          addError(
            context,
            'polygon_holes_overlap',
            'Ring lubang tidak boleh tumpang tindih.',
            `${path}[${index}]`,
            featureIndex,
          );
          break;
        }
      }
    }
  }
}

function signedArea(ring: Position[]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area +=
      ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function hasSelfIntersection(ring: Position[]): boolean {
  const segments = ring.length - 1;
  for (let first = 0; first < segments; first += 1) {
    for (let second = first + 1; second < segments; second += 1) {
      if (second === first + 1 || (first === 0 && second === segments - 1))
        continue;
      if (
        segmentsIntersect(
          ring[first],
          ring[first + 1],
          ring[second],
          ring[second + 1],
        )
      )
        return true;
    }
  }
  return false;
}

function ringsIntersect(first: Position[], second: Position[]): boolean {
  for (let left = 0; left < first.length - 1; left += 1) {
    for (let right = 0; right < second.length - 1; right += 1) {
      if (
        segmentsIntersect(
          first[left],
          first[left + 1],
          second[right],
          second[right + 1],
        )
      )
        return true;
    }
  }
  return false;
}

function segmentsIntersect(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (
    (abC === 0 && onSegment(a, b, c)) ||
    (abD === 0 && onSegment(a, b, d)) ||
    (cdA === 0 && onSegment(c, d, a)) ||
    (cdB === 0 && onSegment(c, d, b))
  );
}

function orientation(a: Position, b: Position, c: Position): number {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
  return Math.abs(value) < 1e-12 ? 0 : value > 0 ? 1 : 2;
}

function onSegment(a: Position, b: Position, point: Position): boolean {
  return (
    point[0] <= Math.max(a[0], b[0]) &&
    point[0] >= Math.min(a[0], b[0]) &&
    point[1] <= Math.max(a[1], b[1]) &&
    point[1] >= Math.min(a[1], b[1])
  );
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (
    let current = 0, previous = ring.length - 1;
    current < ring.length;
    previous = current++
  ) {
    const [x, y] = ring[current];
    const [previousX, previousY] = ring[previous];
    const crosses =
      y > point[1] !== previousY > point[1] &&
      point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function samePosition(first: Position, second: Position): boolean {
  return (
    first.length === second.length &&
    first.every((coordinate, index) => coordinate === second[index])
  );
}

function sameHorizontalPosition(first: Position, second: Position): boolean {
  return first[0] === second[0] && first[1] === second[1];
}

function positiveLimit(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function addError(
  context: ValidatorContext,
  code: string,
  message: string,
  path: string,
  featureIndex?: number,
): void {
  context.errors.push({
    code,
    message,
    path,
    ...(featureIndex === undefined ? {} : { featureIndex }),
  });
}
