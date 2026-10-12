import { validateGeoJson } from './gis-geometry.validator';

describe('validateGeoJson', () => {
  it('rejects empty collections and features without a drawable geometry', () => {
    expect(
      validateGeoJson({ type: 'FeatureCollection', features: [] }).valid,
    ).toBe(false);
    const report = validateGeoJson({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: null, properties: {} }],
    });
    expect(report.valid).toBe(false);
    expect(report.errors[0]).toMatchObject({ featureIndex: 0 });
  });

  it('rejects non-finite and out-of-range coordinates', () => {
    const report = validateGeoJson({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [181, Number.NaN] },
      properties: {},
    });
    expect(report.valid).toBe(false);
    expect(report.errors.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'coordinate_longitude_out_of_range',
        'coordinate_not_finite',
      ]),
    );
  });

  it('accepts valid 3D positions and GeometryCollections recursively', () => {
    const report = validateGeoJson({
      type: 'GeometryCollection',
      geometries: [
        { type: 'Point', coordinates: [106.8, -6.2, 12.5] },
        {
          type: 'LineString',
          coordinates: [
            [106.7, -6.3, 0],
            [106.9, -6.1, 3],
          ],
        },
      ],
    });
    expect(report.valid).toBe(true);
    expect(report.geometryTypes).toEqual([
      'GeometryCollection',
      'LineString',
      'Point',
    ]);
    expect(report.coordinateCount).toBe(3);
  });

  it('rejects degenerate lines and unclosed or self-intersecting polygon rings', () => {
    const degenerate = validateGeoJson({
      type: 'LineString',
      coordinates: [
        [106, -6],
        [106, -6],
      ],
    });
    const verticalOnly = validateGeoJson({
      type: 'LineString',
      coordinates: [
        [106, -6, 1],
        [106, -6, 2],
      ],
    });
    const openRing = validateGeoJson({
      type: 'Polygon',
      coordinates: [
        [
          [106, -6],
          [107, -6],
          [107, -5],
          [106, -5],
        ],
      ],
    });
    const crossingRing = validateGeoJson({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
          [0, 0],
        ],
      ],
    });
    expect(degenerate.errors.map(({ code }) => code)).toContain(
      'line_degenerate',
    );
    expect(verticalOnly.errors.map(({ code }) => code)).toContain(
      'line_degenerate',
    );
    expect(openRing.errors.map(({ code }) => code)).toContain(
      'polygon_ring_not_closed',
    );
    expect(crossingRing.errors.map(({ code }) => code)).toContain(
      'polygon_ring_self_intersection',
    );
  });

  it('rejects geometry types not allowed for a master-data target', () => {
    const report = validateGeoJson(
      {
        type: 'LineString',
        coordinates: [
          [106, -6],
          [107, -5],
        ],
      },
      { allowedGeometryTypes: ['Polygon', 'MultiPolygon'] },
    );
    expect(report.valid).toBe(false);
    expect(report.errors.map(({ code }) => code)).toContain(
      'geometry_type_not_allowed',
    );
  });

  it('enforces feature, coordinate, depth, and ring-complexity limits', () => {
    const pointFeature = (longitude: number) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, -6] },
      properties: {},
    });
    const tooManyFeatures = validateGeoJson(
      {
        type: 'FeatureCollection',
        features: [pointFeature(106), pointFeature(107)],
      },
      { maxFeatures: 1 },
    );
    const tooManyCoordinates = validateGeoJson(
      {
        type: 'LineString',
        coordinates: [
          [106, -6],
          [107, -5],
        ],
      },
      { maxCoordinates: 1 },
    );
    const tooDeep = validateGeoJson(
      {
        type: 'GeometryCollection',
        geometries: [
          {
            type: 'GeometryCollection',
            geometries: [{ type: 'Point', coordinates: [106, -6] }],
          },
        ],
      },
      { maxDepth: 1 },
    );
    const ringTooComplex = validateGeoJson(
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      },
      { maxRingPositions: 4 },
    );

    expect(tooManyFeatures.errors.map(({ code }) => code)).toContain(
      'feature_limit_exceeded',
    );
    expect(tooManyCoordinates.errors.map(({ code }) => code)).toContain(
      'coordinate_limit_exceeded',
    );
    expect(tooDeep.errors.map(({ code }) => code)).toContain(
      'geometry_depth_exceeded',
    );
    expect(ringTooComplex.errors.map(({ code }) => code)).toContain(
      'polygon_ring_too_complex',
    );
  });
});
